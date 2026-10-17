import { cleanText, normalisePhone } from '@/utils/validation.js';
import {
  PAYMENT_METHODS, guessPaymentMethod, normaliseReference, paymentFingerprint, parseAmountMinor, parsePaidAt, validatePayment,
} from '@/utils/payment-schema.js';

/**
 * Reads a bank or M-Pesa statement (.xlsx or .csv) into payment candidates. Nothing here touches the network
 * or the page: it turns a file into rows, works out which column is which, and checks every row with the same
 * rules the server applies. The server checks again, because a browser can send anything.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

/** What the importer looks for. `required` ones must be mapped before anything can be imported. */
export const IMPORT_FIELDS = Object.freeze([
  { key: 'date', label: 'Date paid', required: true },
  { key: 'amount', label: 'Amount received', required: true },
  { key: 'reference', label: 'Receipt / reference' },
  { key: 'payerName', label: 'Payer name' },
  { key: 'payerPhone', label: 'Payer phone' },
  { key: 'studentNumber', label: 'Student number / account' },
  { key: 'details', label: 'Details / narration' },
  { key: 'method', label: 'Payment method' },
  { key: 'debit', label: 'Money out (skipped)' },
]);

// Header words seen in Kenyan bank and M-Pesa statements. Compared after lower-casing and stripping punctuation.
const SYNONYMS = {
  date: ['date', 'paid at', 'payment date', 'date paid', 'transaction date', 'trans date', 'txn date', 'value date', 'posting date', 'completion time', 'completion date', 'date and time', 'date time', 'time'],
  amount: ['amount', 'amount paid', 'paid in', 'credit', 'credits', 'credit amount', 'deposit', 'deposits', 'money in', 'received', 'amount received', 'amount kes', 'kes'],
  debit: ['withdrawn', 'withdrawal', 'withdrawals', 'debit', 'debits', 'paid out', 'money out', 'amount debited'],
  reference: ['reference', 'reference number', 'reference no', 'ref', 'ref no', 'ref number', 'receipt', 'receipt no', 'receipt number', 'transaction id', 'transaction code', 'transaction ref', 'trans id', 'txn id', 'mpesa code', 'mpesa receipt', 'm pesa receipt', 'cheque no', 'slip no', 'confirmation code'],
  payerName: ['name', 'payer', 'payer name', 'customer', 'customer name', 'paid by', 'sender', 'sender name', 'from', 'account name', 'depositor', 'full name', 'student name'],
  payerPhone: ['phone', 'phone number', 'phone no', 'msisdn', 'mobile', 'mobile number', 'payer phone', 'telephone', 'tel', 'sender phone'],
  studentNumber: ['student number', 'student no', 'student id', 'admission no', 'admission number', 'adm no', 'reg no', 'registration number', 'registration no', 'account no', 'account number', 'bill ref', 'bill ref number', 'bill reference', 'bill reference number'],
  details: ['details', 'description', 'narration', 'particulars', 'remarks', 'notes', 'transaction details', 'memo', 'narrative', 'transaction description'],
  method: ['method', 'payment method', 'payment mode', 'mode', 'mode of payment', 'channel', 'payment channel'],
};
const LOOSE = new Set(['date', 'amount', 'reference', 'phone', 'narration', 'details', 'description', 'receipt']);

const pad = (n) => String(n).padStart(2, '0');

/** "Receipt No." becomes "receipt no": lower case, no accents, no punctuation. */
export function normaliseHeader(raw) {
  return String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * A date cell as wall-clock text. Spreadsheet readers hand back the time as it appears on the sheet but
 * labelled UTC, so the UTC parts are the wall clock. parsePaidAt then reads it as Nairobi time.
 */
export function dateToWallText(date) {
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return time === '00:00:00' ? day : `${day} ${time}`;
}

/** One cell as plain text (numbers keep their digits, so a long bank reference is not shown as 1.2E+11). */
export function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dateToWallText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return cleanText(String(value));
}

/* ------------------------------------------------------------------ CSV */

function detectDelimiter(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim()).slice(0, 8);
  let best = ',';
  let bestScore = 0;
  for (const candidate of [',', ';', '\t']) {
    const score = lines.reduce((sum, line) => sum + line.replace(/"[^"]*"/g, '').split(candidate).length - 1, 0);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

/** Reads CSV text (quotes, doubled quotes, comma / semicolon / tab, Windows line ends, a leading byte-order mark). */
export function parseCsv(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((cells) => cells.map((value) => (value === '' ? null : value)));
}

/* ------------------------------------------------------------------ files */

export class ImportFileError extends Error {}

const isCsvName = (name) => /\.(csv|tsv|txt)$/i.test(name);

/**
 * Reads the first sheet of a file the administrator chose. `.xlsx` is read with a library that is only
 * loaded now (so the console stays light until someone imports), in its single-thread build, which needs
 * no web worker and so works under the site's security policy.
 * @returns {Promise<{ sheetName: string, data: any[][] }>}
 */
export async function readSpreadsheetFile(file) {
  if (!file) throw new ImportFileError('Choose a file to import.');
  if (file.size > MAX_FILE_BYTES) throw new ImportFileError('That file is larger than 5 MB. Export only the payments you need and try again.');
  const name = String(file.name ?? '');
  let sheetName = name;
  let data;
  if (isCsvName(name)) {
    data = parseCsv(await file.text());
  } else if (/\.xlsx$/i.test(name)) {
    let sheets;
    try {
      const { default: readXlsxFile } = await import('read-excel-file/universal');
      sheets = await readXlsxFile(await file.arrayBuffer());
    } catch {
      throw new ImportFileError('That spreadsheet could not be read. Open it in Excel and save it again as .xlsx or .csv.');
    }
    const first = sheets?.find((sheet) => sheet.data?.length) ?? sheets?.[0];
    sheetName = first?.sheet ?? name;
    data = first?.data ?? [];
  } else if (/\.xls$/i.test(name)) {
    throw new ImportFileError('Old .xls files are not supported. Open it in Excel and save it as .xlsx or .csv.');
  } else {
    throw new ImportFileError('Choose an .xlsx or .csv file.');
  }
  const used = data.filter((row) => row.some((cell) => cell != null && cell !== ''));
  if (!used.length) throw new ImportFileError('That file has no rows in it.');
  if (data.length > MAX_ROWS + 50) throw new ImportFileError(`That file has more than ${MAX_ROWS} rows. Split it into smaller files.`);
  return { sheetName, data };
}

/* ------------------------------------------------------------------ columns */

const columnLetter = (index) => {
  let n = index;
  let out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
};

const headerHits = (cells) => cells.reduce((count, cell) => {
  const text = normaliseHeader(cellText(cell));
  return text && Object.values(SYNONYMS).some((words) => words.includes(text)) ? count + 1 : count;
}, 0);

/**
 * Finds the header row (statements often start with a title or the account holder's name) and returns the
 * column headings with the rows beneath. Row numbers are the ones the person sees in their spreadsheet.
 */
export function toTable(data) {
  const limit = Math.min(data.length, 40);
  let headerIndex = -1;
  for (let i = 0; i < limit; i += 1) {
    if (headerHits(data[i]) >= 2) { headerIndex = i; break; }
  }
  if (headerIndex < 0) headerIndex = Math.max(0, data.findIndex((row) => row.some((cell) => cell != null && cell !== '')));
  const width = data.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = Array.from({ length: width }, (_, i) => cellText(data[headerIndex]?.[i]) || `Column ${columnLetter(i)}`);
  const rows = data.slice(headerIndex + 1).map((cells, offset) => ({ rowNumber: headerIndex + 2 + offset, cells }));
  return { headers, rows, headerFound: headerHits(data[headerIndex] ?? []) >= 2 };
}

/** A column for each field, by header wording. -1 means "not found". A column is only used once. */
export function autoMap(headers) {
  const normal = headers.map(normaliseHeader);
  const mapping = Object.fromEntries(IMPORT_FIELDS.map(({ key }) => [key, -1]));
  const taken = new Set();
  const claim = (key, index) => { mapping[key] = index; taken.add(index); };
  // Exact wording first, in the order the synonyms are listed; then a looser "contains the phrase" pass.
  for (const exact of [true, false]) {
    for (const { key } of IMPORT_FIELDS) {
      if (mapping[key] >= 0) continue;
      for (const word of SYNONYMS[key]) {
        if (!exact && !(LOOSE.has(word) || word.includes(' '))) continue;
        const index = normal.findIndex((text, i) => !taken.has(i) && text && (exact ? text === word : new RegExp(`(^| )${word}( |$)`).test(text)));
        if (index >= 0) { claim(key, index); break; }
      }
    }
  }
  return mapping;
}

/* ------------------------------------------------------------------ rows */

const PHONE_IN_TEXT = /(?:\+?254|\b0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/;

/** M-Pesa details read "Pay Bill from 254712345678 - AMINA KAMAU Acc. CFL-2026-00001". */
export function extractPayer(text) {
  const clean = cleanText(text);
  const phoneMatch = PHONE_IN_TEXT.exec(clean);
  const phone = phoneMatch ? normalisePhone(phoneMatch[0]) : '';
  const nameMatch = /\d[\d\s*]{6,}\s*-\s*([A-Za-z][A-Za-z' .-]{2,60}?)(?=\s+(?:acc|account|bill|ref)\b|\s*$)/i.exec(clean);
  return { phone: phone || '', name: nameMatch ? cleanText(nameMatch[1]) : '' };
}

const isMoneyOut = (cell) => (typeof cell === 'number' ? cell < 0 : /^\s*[-(]/.test(String(cell ?? '')));
const hasValue = (cell) => cell != null && cell !== '' && !(typeof cell === 'number' && cell === 0);

function methodFrom(methodCell, details, fallback) {
  const typed = cleanText(cellText(methodCell)).toLowerCase();
  if (PAYMENT_METHODS.includes(typed)) return typed;
  return guessPaymentMethod(cellText(methodCell)) || guessPaymentMethod(details) || fallback || null;
}

/**
 * Turns table rows into payment candidates.
 * status: 'ready' (can be imported), 'skipped' (money out, not a payment), 'error' (cannot be imported as it is).
 */
export function buildCandidates(table, mapping, { method = '', purpose = 'tuition', now = new Date() } = {}) {
  const at = (cells, key) => (mapping[key] >= 0 ? cells[mapping[key]] : null);
  const out = [];
  const seen = new Set();
  for (const { rowNumber, cells } of table.rows) {
    if (!cells.some((cell) => cell != null && cell !== '')) continue;
    const candidate = { rowNumber, status: 'ready', reason: '' };

    const amountCell = at(cells, 'amount');
    const debitCell = at(cells, 'debit');
    const details = cellText(at(cells, 'details'));
    const nameCell = cellText(at(cells, 'payerName'));
    const found = extractPayer(`${nameCell} ${details}`);

    candidate.reference = normaliseReference(at(cells, 'reference'));
    candidate.payerName = (nameCell && !/^[\d\s+*-]+$/.test(nameCell) ? nameCell : found.name).slice(0, 80);
    const phoneCell = cellText(at(cells, 'payerPhone'));
    candidate.payerPhone = (phoneCell && normalisePhone(phoneCell)) || found.phone || '';
    candidate.studentNumberHint = cellText(at(cells, 'studentNumber')).toUpperCase();
    candidate.note = details.slice(0, 300);
    candidate.matchText = cleanText(`${nameCell} ${details} ${candidate.studentNumberHint}`);
    candidate.purpose = purpose;
    candidate.method = methodFrom(at(cells, 'method'), `${details} ${nameCell}`, method);

    if (isMoneyOut(amountCell) || (!hasValue(amountCell) && hasValue(debitCell))) {
      candidate.status = 'skipped';
      candidate.reason = 'Money out, not a payment';
      out.push(candidate);
      continue;
    }
    candidate.amountMinor = parseAmountMinor(typeof amountCell === 'string' ? amountCell : amountCell ?? '');
    const dateCell = at(cells, 'date');
    candidate.paidAt = parsePaidAt(dateCell instanceof Date ? dateToWallText(dateCell) : dateCell);

    const checked = validatePayment({
      amountMinor: candidate.amountMinor ?? undefined,
      amount: candidate.amountMinor == null ? '' : undefined,
      paidAt: candidate.paidAt,
      method: candidate.method,
      purpose,
      reference: candidate.reference,
      payerName: candidate.payerName,
      payerPhone: candidate.payerPhone,
      note: candidate.note,
    }, { now });
    if (!checked.ok) {
      // A missing method is one choice for the whole file, so it is reported once by the preview, not on every row.
      const { method: methodError, ...rest } = checked.errors;
      const first = Object.values(rest)[0];
      if (first) { candidate.status = 'error'; candidate.reason = first; } else if (methodError) candidate.needsMethod = true;
    }

    if (candidate.status === 'ready') {
      const key = candidate.reference && candidate.method
        ? `ref|${candidate.method}|${candidate.reference}`
        : `fp|${paymentFingerprint({ paidAt: candidate.paidAt, amountMinor: candidate.amountMinor, payerPhone: candidate.payerPhone, payerName: candidate.payerName })}`;
      if (seen.has(key)) candidate.duplicate = 'file';
      seen.add(key);
    }
    out.push(candidate);
  }
  return out;
}

/** A summary line for the preview. */
export function tally(candidates) {
  const count = (test) => candidates.filter(test).length;
  return {
    total: candidates.length,
    ready: count((c) => c.status === 'ready' && !c.duplicate),
    skipped: count((c) => c.status === 'skipped'),
    errors: count((c) => c.status === 'error'),
    duplicates: count((c) => c.status === 'ready' && c.duplicate),
    needMethod: count((c) => c.needsMethod),
  };
}
