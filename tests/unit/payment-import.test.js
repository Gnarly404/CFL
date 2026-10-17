import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  autoMap, buildCandidates, cellText, extractPayer, ImportFileError, normaliseHeader, parseCsv, readSpreadsheetFile, tally, toTable,
} from '@/payments/import-parse.js';
import { buildStudentIndex, matchPayment } from '@/payments/match.js';
import {
  alreadyRecorded, existingKeys, ledgerSummary, startOfMonthEat, studentBalance, totalsByStudent,
} from '@/payments/ledger.js';

const now = new Date('2026-10-12T09:00:00.000Z');
const fixture = () => {
  const bytes = readFileSync(new URL('../fixtures/mpesa-statement.xlsx', import.meta.url));
  return new File([bytes], 'statement.xlsx');
};

describe('reading CSV', () => {
  it('handles quotes, doubled quotes, semicolons, a byte-order mark and Windows line ends', () => {
    expect(parseCsv('﻿a,b\r\n"1,500","say ""hi"""\r\n')).toEqual([['a', 'b'], ['1,500', 'say "hi"']]);
    expect(parseCsv('Date;Amount\n05/10/2026;1500')).toEqual([['Date', 'Amount'], ['05/10/2026', '1500']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps a quoted cell that spans lines, and reads empty cells as null', () => {
    expect(parseCsv('a,b\n"line1\nline2",\n')).toEqual([['a', 'b'], ['line1\nline2', null]]);
  });
});

describe('finding the columns', () => {
  it('normalises header wording', () => {
    expect(normaliseHeader('Receipt No.')).toBe('receipt no');
    expect(normaliseHeader('Amount (KES)')).toBe('amount kes');
    expect(normaliseHeader('  PAID   IN ')).toBe('paid in');
  });
  it('skips a title block above the headings and maps an M-Pesa statement', () => {
    const table = toTable([['Paybill 123'], [], ['Receipt No.', 'Completion Time', 'Details', 'Paid In', 'Withdrawn', 'Balance'], ['TJ1', '2026-10-05', 'x', 100, null, 100]]);
    expect(table.headerFound).toBe(true);
    expect(table.headers[0]).toBe('Receipt No.');
    expect(table.rows[0].rowNumber).toBe(4); // the row number the person sees in their spreadsheet
    expect(autoMap(table.headers)).toMatchObject({ reference: 0, date: 1, details: 2, amount: 3, debit: 4 });
  });
  it('uses a column once, and recognises bank-style headings', () => {
    const map = autoMap(['Transaction Date', 'Narration', 'Debit', 'Credit', 'Account No', 'Customer Name', 'Mobile']);
    expect(map).toMatchObject({
      date: 0, details: 1, debit: 2, amount: 3, studentNumber: 4, payerName: 5, payerPhone: 6,
    });
    expect(map.reference).toBe(-1);
  });
  it('names columns that have no heading', () => {
    expect(toTable([[null, 'Amount'], [1, 2]]).headers).toEqual(['Column A', 'Amount']);
  });
});

describe('reading cells', () => {
  it('treats a spreadsheet time as Nairobi wall-clock time, not UTC', () => {
    expect(cellText(new Date(Date.UTC(2026, 9, 5, 22, 30, 0)))).toBe('2026-10-05 22:30:00');
    expect(cellText(new Date(Date.UTC(2026, 9, 5)))).toBe('2026-10-05');
    expect(cellText(123456789012)).toBe('123456789012'); // a long reference is not shown as 1.2E+11
  });
  it('pulls the phone and the name out of M-Pesa details text', () => {
    expect(extractPayer('Pay Bill from 254712345678 - AMINA KAMAU Acc. CFL-2026-00001')).toEqual({ phone: '+254712345678', name: 'AMINA KAMAU' });
    expect(extractPayer('Funds received from 0733 000 111 - GRACE KAMAU')).toEqual({ phone: '+254733000111', name: 'GRACE KAMAU' });
    expect(extractPayer('Cash deposit')).toEqual({ phone: '', name: '' });
  });
});

describe('importing a real .xlsx statement', () => {
  it('reads the file, finds the headings and builds payments', async () => {
    const { data } = await readSpreadsheetFile(fixture());
    const table = toTable(data);
    expect(table.headers).toEqual(['Receipt No.', 'Completion Time', 'Details', 'Paid In', 'Withdrawn', 'Balance']);
    const mapping = autoMap(table.headers);
    const rows = buildCandidates(table, mapping, { method: 'mpesa', now });

    const [first, grace, out, unknown, repeat, total] = rows;
    expect(first).toMatchObject({
      rowNumber: 5, status: 'ready', amountMinor: 1500050, method: 'mpesa', reference: 'TJ51ABCD12', payerPhone: '+254712345678', payerName: 'AMINA KAMAU',
    });
    // 22:30 on the sheet is 22:30 in Nairobi (19:30 UTC), on the same calendar day
    expect(first.paidAt.toISOString()).toBe('2026-10-05T19:30:00.000Z');
    expect(grace).toMatchObject({ status: 'ready', amountMinor: 500000, payerPhone: '+254733000111' });
    expect(out).toMatchObject({ status: 'skipped', reason: 'Money out, not a payment' });
    expect(unknown.paidAt.toISOString()).toBe('2026-10-07T05:15:00.000Z'); // 07/10/2026 reads day-first
    expect(repeat).toMatchObject({ status: 'ready', duplicate: 'file' }); // the same receipt twice in one file
    expect(total.status).toBe('error'); // the footer is not a payment
    expect(tally(rows)).toEqual({
      total: 6, ready: 3, skipped: 1, errors: 1, duplicates: 1, needMethod: 0,
    });
  });

  it('reports a missing method once for the whole file, not on every row', async () => {
    const { data } = await readSpreadsheetFile(fixture());
    const table = toTable(data);
    // "Pay Bill" in the details says M-Pesa, so that row needs no choice; "Funds received" says nothing, so it does
    const rows = buildCandidates(table, autoMap(table.headers), { method: '', now });
    expect(rows[0]).toMatchObject({ method: 'mpesa' });
    expect(rows[0].needsMethod).toBeUndefined();
    expect(rows[1]).toMatchObject({ method: null, needsMethod: true });
    const plain = buildCandidates({ headers: ['d', 'a'], rows: [{ rowNumber: 2, cells: ['2026-10-05', 1000] }] }, { date: 0, amount: 1 }, { now });
    expect(plain[0]).toMatchObject({ status: 'ready', needsMethod: true, method: null });
    expect(tally(plain).needMethod).toBe(1);
    const chosen = buildCandidates({ headers: ['d', 'a'], rows: [{ rowNumber: 2, cells: ['2026-10-05', 1000] }] }, { date: 0, amount: 1 }, { method: 'cash', now });
    expect(chosen[0]).toMatchObject({ method: 'cash' });
    expect(chosen[0].needsMethod).toBeUndefined();
  });

  it('refuses files it cannot read, with a reason a person can act on', async () => {
    await expect(readSpreadsheetFile(new File(['x'], 'old.xls'))).rejects.toThrow(/\.xls/);
    await expect(readSpreadsheetFile(new File(['x'], 'photo.png'))).rejects.toBeInstanceOf(ImportFileError);
    await expect(readSpreadsheetFile(new File(['not a zip'], 'broken.xlsx'))).rejects.toThrow(/could not be read/);
    await expect(readSpreadsheetFile(new File([''], 'empty.csv'))).rejects.toThrow(/no rows/);
    await expect(readSpreadsheetFile(new File([new Uint8Array(6 * 1024 * 1024)], 'huge.csv'))).rejects.toThrow(/5 MB/);
  });
});

describe('rows that are not good payments', () => {
  const run = (cells, map = { date: 0, amount: 1, details: 2 }) => buildCandidates({ headers: ['d', 'a', 'x'], rows: [{ rowNumber: 2, cells }] }, map, { method: 'cash', now })[0];

  it('skips money out however it is written, and rejects zero, text and future dates', () => {
    expect(run(['2026-10-05', -500]).status).toBe('skipped');
    expect(run(['2026-10-05', '(500)']).status).toBe('skipped');
    expect(run(['2026-10-05', '-500']).status).toBe('skipped');
    expect(run(['2026-10-05', 0]).status).toBe('error');
    expect(run(['2026-10-05', 'n/a']).status).toBe('error');
    expect(run(['2026-12-25', 1000])).toMatchObject({ status: 'error', reason: expect.stringMatching(/future/) });
    expect(run(['not a date', 1000]).status).toBe('error');
  });
  it('accepts amounts written the way people write them', () => {
    expect(run(['2026-10-05', '1,500.50']).amountMinor).toBe(150050);
    expect(run(['2026-10-05', 'KES 15,000']).amountMinor).toBe(1500000);
    expect(run(['2026-10-05', 2000.5]).amountMinor).toBe(200050);
  });
  it('ignores rows with nothing in them', () => {
    const rows = buildCandidates({ headers: ['d', 'a'], rows: [{ rowNumber: 2, cells: [null, null] }, { rowNumber: 3, cells: ['', ''] }] }, { date: 0, amount: 1 }, { now });
    expect(rows).toEqual([]);
  });
  it('flags the same reference twice but not different payments on the same day', () => {
    const table = { headers: ['d', 'a', 'r'], rows: [{ rowNumber: 2, cells: ['2026-10-05', 100, 'R1'] }, { rowNumber: 3, cells: ['2026-10-05', 100, 'R2'] }, { rowNumber: 4, cells: ['2026-10-05', 100, 'r1'] }] };
    const rows = buildCandidates(table, { date: 0, amount: 1, reference: 2 }, { method: 'bank', now });
    expect(rows.map((row) => row.duplicate)).toEqual([undefined, undefined, 'file']);
  });
});

/* ------------------------------------------------------------------ matching */

const students = [
  { uid: 'amina', displayName: 'Amina Kamau', firstName: 'Amina', middleName: 'W', surname: 'Kamau', studentNumber: 'CFL-2026-00001', phoneNumber: '+254712345678', contactPhone: '+254733000111' },
  { uid: 'brian', displayName: 'Brian Otieno', firstName: 'Brian', surname: 'Otieno', studentNumber: 'CFL-2026-00002', phoneNumber: '+254700000002', contactPhone: '+254733000222' },
  { uid: 'kevin', displayName: 'Kevin Kamau', firstName: 'Kevin', surname: 'Kamau', studentNumber: 'CFL-2026-00003', phoneNumber: '', contactPhone: '+254733000111' }, // shares Amina's parent
  { uid: 'twin1', displayName: 'Mary Wanjiku', firstName: 'Mary', surname: 'Wanjiku', studentNumber: 'CFL-2026-00004', phoneNumber: '+254711111111', contactPhone: '' },
  { uid: 'twin2', displayName: 'Mary Wanjiku', firstName: 'Mary', surname: 'Wanjiku', studentNumber: 'CFL-2026-00005', phoneNumber: '+254722222222', contactPhone: '' },
];
const index = buildStudentIndex(students);
const row = (extra) => ({
  payerName: '', payerPhone: '', studentNumberHint: '', matchText: '', ...extra,
});
const match = (extra) => matchPayment(row(extra), index);

describe('matching a payment to a student', () => {
  it('trusts a student number found in the text, with or without hyphens and in any case', () => {
    expect(match({ matchText: 'Pay Bill Acc. CFL-2026-00002' })).toMatchObject({ tier: 'sure', studentId: 'brian' });
    expect(match({ matchText: 'cfl202600002 school fees' })).toMatchObject({ tier: 'sure', studentId: 'brian' });
    expect(match({ studentNumberHint: 'CFL-2026-00001' })).toMatchObject({ tier: 'sure', studentId: 'amina' });
  });
  it("trusts the student's own phone, and checks the name when there is one", () => {
    expect(match({ payerPhone: '+254712345678' })).toMatchObject({ tier: 'sure', studentId: 'amina' });
    expect(match({ payerPhone: '+254712345678', payerName: 'AMINA KAMAU', matchText: 'AMINA KAMAU' })).toMatchObject({ tier: 'sure', studentId: 'amina' });
    // same phone, a different person's name: filled in, but flagged for a second look
    expect(match({ payerPhone: '+254712345678', payerName: 'PETER NJOROGE', matchText: 'PETER NJOROGE' })).toMatchObject({ tier: 'likely', studentId: 'amina' });
  });
  it('fills in a unique emergency-contact phone as likely, and leaves a shared one for a person', () => {
    expect(match({ payerPhone: '+254733000222' })).toMatchObject({ tier: 'likely', studentId: 'brian' });
    const shared = match({ payerPhone: '+254733000111' });
    expect(shared).toMatchObject({ tier: 'ambiguous', studentId: null });
    expect(shared.candidates.sort()).toEqual(['amina', 'kevin']);
  });
  it("uses the payer's name to separate brothers and sisters who share a parent's phone", () => {
    expect(match({ payerPhone: '+254733000111', payerName: 'KEVIN KAMAU', matchText: 'KEVIN KAMAU' })).toMatchObject({ tier: 'likely', studentId: 'kevin' });
  });
  it('needs the first name and the surname, in either order', () => {
    expect(match({ payerName: 'Otieno brian', matchText: 'Otieno brian' })).toMatchObject({ tier: 'likely', studentId: 'brian' });
    expect(match({ payerName: 'GRACE KAMAU', matchText: 'GRACE KAMAU' })).toMatchObject({ tier: 'none' }); // a parent: surname alone is not enough
    expect(match({ payerName: 'BRIAN', matchText: 'BRIAN' })).toMatchObject({ tier: 'none' });
  });
  it('never guesses between two students with the same name', () => {
    const result = match({ payerName: 'MARY WANJIKU', matchText: 'MARY WANJIKU' });
    expect(result).toMatchObject({ tier: 'ambiguous', studentId: null });
    expect(result.candidates.sort()).toEqual(['twin1', 'twin2']);
    // ...but a number or phone settles it
    expect(match({ payerName: 'MARY WANJIKU', matchText: 'MARY WANJIKU CFL-2026-00005' })).toMatchObject({ tier: 'sure', studentId: 'twin2' });
    expect(match({ payerName: 'MARY WANJIKU', payerPhone: '+254711111111', matchText: 'MARY WANJIKU' })).toMatchObject({ tier: 'sure', studentId: 'twin1' });
  });
  it('does not take a short number from the middle of a sentence', () => {
    const small = buildStudentIndex([{ uid: 'x', displayName: 'X Y', firstName: 'X', surname: 'Y', studentNumber: 'A12' }]);
    expect(matchPayment(row({ matchText: 'paid A12 today' }), small).tier).toBe('none');
    expect(matchPayment(row({ studentNumberHint: 'A12' }), small)).toMatchObject({ tier: 'sure', studentId: 'x' });
  });
  it('finds nothing for a stranger', () => {
    expect(match({ payerName: 'UNKNOWN PERSON', payerPhone: '+254799999999', matchText: 'UNKNOWN PERSON' })).toMatchObject({ tier: 'none', studentId: null, candidates: [] });
  });
  it('matches the payments in the statement fixture the way a person would', async () => {
    const { data } = await readSpreadsheetFile(fixture());
    const table = toTable(data);
    const [amina, grace, , stranger] = buildCandidates(table, autoMap(table.headers), { method: 'mpesa', now });
    expect(matchPayment(amina, index)).toMatchObject({ tier: 'sure', studentId: 'amina' });
    expect(matchPayment(grace, index).tier).toBe('ambiguous'); // Grace's number is the contact for two students
    expect(matchPayment(stranger, index).tier).toBe('none');
  });
});

/* ------------------------------------------------------------------ ledger */

const pay = (extra) => ({
  amountMinor: 100000, status: 'confirmed', purpose: 'tuition', method: 'mpesa', studentId: 'amina', paidAt: new Date('2026-10-05T10:00:00Z'), ...extra,
});

describe('the ledger', () => {
  it('counts tuition against the fees, keeps other payments apart, and ignores reversed ones', () => {
    const totals = totalsByStudent([
      pay({ amountMinor: 3000000 }), pay({ amountMinor: 500000, purpose: 'application_fee' }), pay({ amountMinor: 999999, status: 'reversed' }), pay({ studentId: null }),
    ]);
    expect(totals.get('amina')).toMatchObject({ tuitionMinor: 3000000, otherMinor: 500000, count: 2 });
    expect(studentBalance({ uid: 'amina', feeDueMinor: 4500000 }, totals)).toMatchObject({ paidMinor: 3000000, key: 'part', balanceMinor: 1500000 });
    expect(studentBalance({ uid: 'amina', feeDueMinor: 3000000 }, totals).key).toBe('cleared');
    expect(studentBalance({ uid: 'amina', feeDueMinor: 2000000 }, totals).key).toBe('over');
    expect(studentBalance({ uid: 'brian', feeDueMinor: 100 }, totals).key).toBe('unpaid');
    expect(studentBalance({ uid: 'brian', feeDueMinor: null }, totals).key).toBe('none');
  });
  it('works out the month in Nairobi, where 1 October starts at 21:00 UTC on 30 September', () => {
    expect(startOfMonthEat(new Date('2026-10-12T09:00:00Z')).toISOString()).toBe('2026-09-30T21:00:00.000Z');
    const late = pay({ paidAt: new Date('2026-09-30T22:00:00Z'), amountMinor: 700 }); // already 1 Oct in Nairobi
    const early = pay({ paidAt: new Date('2026-09-30T20:00:00Z'), amountMinor: 300 }); // still 30 Sep
    expect(ledgerSummary([late, early], [], now)).toMatchObject({ collectedMinor: 1000, monthMinor: 700 });
  });
  it('summarises what is unassigned and what is still owed', () => {
    const summary = ledgerSummary(
      [pay({ amountMinor: 1000 }), pay({ studentId: null, amountMinor: 250 }), pay({ studentId: null, status: 'reversed', amountMinor: 9 })],
      [{ uid: 'amina', feeDueMinor: 5000 }, { uid: 'brian', feeDueMinor: 2000 }, { uid: 'cy', feeDueMinor: null }],
      now,
    );
    expect(summary).toMatchObject({
      unassignedCount: 1, unassignedMinor: 250, outstandingMinor: 4000 + 2000, withBalance: 2,
    });
  });
  it('recognises what is already recorded, the way the server does', () => {
    const keys = existingKeys([
      { method: 'mpesa', reference: 'TJ1', status: 'confirmed' },
      { method: 'mpesa', reference: 'TJ2', status: 'reversed' },
      { method: 'cash', reference: '', status: 'confirmed', fingerprint: '2026-10-05T07:00|50000|+254700000001' },
      { method: 'cash', reference: '', status: 'reversed', fingerprint: '2026-10-06T07:00|50000|+254700000001' },
    ]);
    expect(alreadyRecorded({ method: 'mpesa', reference: 'TJ1' }, keys)).toBe('recorded');
    expect(alreadyRecorded({ method: 'mpesa', reference: 'TJ2' }, keys)).toBe('reversed');
    expect(alreadyRecorded({ method: 'bank', reference: 'TJ1' }, keys)).toBe(''); // another method is another payment
    expect(alreadyRecorded({ method: 'cash', reference: '', paidAt: new Date('2026-10-05T07:00:00Z'), amountMinor: 50000, payerPhone: '+254700000001' }, keys)).toBe('recorded');
    expect(alreadyRecorded({ method: 'cash', reference: '', paidAt: new Date('2026-10-06T07:00:00Z'), amountMinor: 50000, payerPhone: '+254700000001' }, keys)).toBe('');
  });
});
