/**
 * Works out which student a payment belongs to. The rule that matters most: a payment is only filled in for
 * the administrator when the evidence points at exactly one student. Anything that could be two people is
 * left for a person to choose, because money recorded against the wrong student is worse than money waiting.
 *
 * Evidence, strongest first:
 *   1. a student number (or account number) found in the row
 *   2. the payer's phone number, matching the student's own phone, or their emergency contact's
 *   3. the payer's name, matching both the first name and the surname
 *
 * tier  'sure'      student number, or the student's own phone (agreeing with the name when there is one)
 *       'likely'    the emergency contact's phone, or the full name: filled in, shown for a second look
 *       'ambiguous' more than one student fits: left blank, the candidates are listed
 *       'none'      nothing fits
 */

const nameWords = (text) => String(text ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z' -]+/g, ' ').split(/[\s-]+/).map((word) => word.replace(/^'+|'+$/g, '')).filter((word) => word.length > 1);

const alnum = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Tokens of free text that could be a student number: kept whole, hyphens and slashes included. */
const numberTokens = (text) => String(text ?? '').toUpperCase()
  .split(/[\s,;:()[\]{}]+/).map((token) => token.replace(/^[.\-/]+|[.\-/]+$/g, '')).filter((token) => token.length >= 3);

const label = (student) => student.displayName || student.email || student.uid;

/** Indexes the student list once so every row of a file is matched without searching the whole list. */
export function buildStudentIndex(students) {
  const byNumber = new Map();
  const byNumberLoose = new Map();
  const byOwnPhone = new Map();
  const byContactPhone = new Map();
  const people = [];
  const push = (map, key, student) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(student)) list.push(student);
    map.set(key, list);
  };
  for (const student of students) {
    const number = String(student.studentNumber ?? '').trim().toUpperCase();
    push(byNumber, number, student);
    if (/\d/.test(number) && alnum(number).length >= 6) push(byNumberLoose, alnum(number), student);
    push(byOwnPhone, student.phoneNumber, student);
    push(byContactPhone, student.contactPhone, student);
    people.push({ student, first: nameWords(student.firstName), middle: nameWords(student.middleName), last: nameWords(student.surname) });
  }
  return {
    byNumber, byNumberLoose, byOwnPhone, byContactPhone, people,
  };
}

const uniqueStudents = (lists) => [...new Set(lists.flat())];

function byStudentNumber(index, candidate) {
  const found = new Set();
  const hint = String(candidate.studentNumberHint ?? '').trim().toUpperCase();
  const tokens = [...(hint ? [hint] : []), ...numberTokens(candidate.matchText)];
  for (const token of tokens) {
    // Short numbers are only trusted from the account-number column, never from the middle of a sentence.
    const trusted = token === hint || token.length >= 5;
    if (!trusted) continue;
    index.byNumber.get(token)?.forEach((student) => found.add(student));
    const loose = alnum(token);
    if (/\d/.test(token) && loose.length >= 6) index.byNumberLoose.get(loose)?.forEach((student) => found.add(student));
  }
  return [...found];
}

function byName(index, candidate) {
  const words = new Set(nameWords(`${candidate.payerName ?? ''} ${candidate.matchText ?? ''}`));
  if (!words.size) return [];
  return index.people.filter(({ first, last }) => first.length && last.length
    && first.every((word) => words.has(word)) && last.every((word) => words.has(word))).map(({ student }) => student);
}

const nameAgrees = (index, candidate, student) => byName(index, candidate).includes(student);

/**
 * @param {object} candidate a row from buildCandidates
 * @param {ReturnType<typeof buildStudentIndex>} index
 * @returns {{ tier: 'sure'|'likely'|'ambiguous'|'none', studentId: string|null, candidates: string[], reason: string }}
 */
export function matchPayment(candidate, index) {
  const pick = (tier, student, reason) => ({
    tier, studentId: student.uid, candidates: [student.uid], reason,
  });
  const unsure = (students, reason) => ({
    tier: 'ambiguous', studentId: null, candidates: students.map((student) => student.uid), reason,
  });

  const numbered = byStudentNumber(index, candidate);
  if (numbered.length === 1) return pick('sure', numbered[0], `Student number ${numbered[0].studentNumber}`);
  if (numbered.length > 1) return unsure(numbered, 'That student number is shared by more than one student.');

  const named = byName(index, candidate);
  const phone = candidate.payerPhone;
  if (phone) {
    const own = index.byOwnPhone.get(phone) ?? [];
    if (own.length === 1) {
      const [student] = own;
      const hasName = Boolean(String(candidate.payerName ?? '').trim());
      if (!hasName || nameAgrees(index, candidate, student)) return pick('sure', student, 'Phone number matches the student');
      return pick('likely', student, 'Phone number matches the student, but the payer name differs');
    }
    if (own.length > 1) return unsure(own, 'More than one student has that phone number.');

    const contacts = index.byContactPhone.get(phone) ?? [];
    if (contacts.length === 1) {
      const [student] = contacts;
      const agreed = nameAgrees(index, candidate, student);
      return pick(agreed ? 'sure' : 'likely', student, `Phone number matches ${label(student)}'s emergency contact`);
    }
    if (contacts.length > 1) {
      // Brothers and sisters often share a parent's phone. Only the payer's name can separate them.
      const both = contacts.filter((student) => named.includes(student));
      if (both.length === 1) return pick('likely', both[0], `Phone matches the emergency contact and the name matches ${label(both[0])}`);
      return unsure(contacts, 'The phone number belongs to the emergency contact of more than one student.');
    }
  }

  if (named.length === 1) return pick('likely', named[0], `Name matches ${label(named[0])}`);
  if (named.length > 1) return unsure(uniqueStudents([named]), 'More than one student has that name.');
  return {
    tier: 'none', studentId: null, candidates: [], reason: 'No student number, phone number or name matched.',
  };
}
