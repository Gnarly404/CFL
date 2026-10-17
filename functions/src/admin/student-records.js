import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { displayNameOf, STUDENT_RECORD_FIELDS, validateStudentRecord } from '../lib/shared/student-record-schema.js';

const MAX_STUDENTS = 1000;
const GUARDIAN_KEYS = { contactName: 'name', contactRelationship: 'relationship', contactPhone: 'phoneNumber' };

/**
 * Builds one complete student record from everything we hold about the person.
 * Precedence: the administrator's saved record, then what the applicant submitted, then the profile
 * (which the student can edit themselves, so it is the least trusted source).
 */
export function mergeStudentRecord({
  uid, user = {}, student = {}, application = null, record = null, programmeIds = [],
}) {
  const applicant = application?.applicant ?? {};
  const identity = applicant.identityDocument ?? {};
  const education = applicant.academicBackground ?? {};
  const contact = application?.contactPerson ?? application?.guardian ?? {};
  const profile = student.profile ?? {};
  const guardian = profile.guardian ?? {};
  const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
  const saved = record && typeof record === 'object' ? record : null;
  // Once an administrator has saved the record it is the whole truth, including fields they cleared.
  const field = (key, ...fallbacks) => (saved && key in saved ? saved[key] ?? '' : first(...fallbacks));

  const applicationReference = first(application?.reference, profile.applicationReference);
  const merged = {
    uid,
    email: first(user.email, student.email, application?.email),
    accountStatus: user.status ?? 'unknown',
    applicationReference,
    programmeIds,
    firstName: field('firstName', applicant.firstName, profile.firstName),
    middleName: field('middleName', applicant.middleName, profile.middleName),
    surname: field('surname', applicant.surname, profile.surname),
    dateOfBirth: field('dateOfBirth', applicant.dateOfBirth, profile.dateOfBirth),
    gender: field('gender', applicant.gender, profile.gender),
    nationality: field('nationality', applicant.nationality, profile.nationality),
    phoneNumber: field('phoneNumber', applicant.phoneNumber, profile.phoneNumber),
    residentialAddress: field('residentialAddress', applicant.residentialAddress),
    countryOfResidence: field('countryOfResidence', applicant.countryOfResidence),
    contactName: field('contactName', contact.name, guardian.name),
    contactRelationship: field('contactRelationship', contact.relationship, guardian.relationship),
    contactPhone: field('contactPhone', contact.phoneNumber, guardian.phoneNumber),
    highestQualification: field('highestQualification', education.highestQualification),
    institutionAttended: field('institutionAttended', education.institutionAttended),
    completionYear: field('completionYear', education.completionYear) || null,
    identificationType: field('identificationType', identity.type),
    identificationNumber: field('identificationNumber', identity.number),
    studentNumber: first(saved?.studentNumber, applicationReference),
    feeDueMinor: Number.isInteger(saved?.feeDueMinor) ? saved.feeDueMinor : null,
    updatedAt: saved?.updatedAt ?? null,
  };
  merged.displayName = displayNameOf(merged) || first(user.displayName, student.displayName);
  return merged;
}

const snapshotData = (snap) => (snap?.exists ? snap.data() : null);
const toIso = (value) => (typeof value?.toDate === 'function' ? value.toDate().toISOString() : value ?? null);

/** What leaves the server for the list: the identification number stays behind until a record is opened. */
function forList(record) {
  const listed = { ...record, hasIdentification: Boolean(record.identificationNumber), updatedAt: toIso(record.updatedAt) };
  delete listed.identificationNumber;
  delete listed.identificationType;
  return listed;
}
const forDetail = (record) => ({ ...record, updatedAt: toIso(record.updatedAt) });

async function loadOne(deps, uid) {
  const { db } = deps;
  const [userSnap, studentSnap, recordSnap, enrolmentSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('students').doc(uid).get(),
    db.collection('studentRecords').doc(uid).get(),
    db.collection('enrolments').where('studentId', '==', uid).get(),
  ]);
  const user = snapshotData(userSnap);
  if (!user || user.role !== 'student') throw new HttpsError('not-found', 'That student no longer exists.');
  const student = snapshotData(studentSnap) ?? {};
  let application = null;
  if (user.applicationId) application = snapshotData(await db.collection('applications').doc(user.applicationId).get());
  return {
    user,
    student,
    application,
    record: snapshotData(recordSnap),
    programmeIds: enrolmentSnap.docs.map((entry) => entry.data().programmeId).filter(Boolean),
  };
}

/** Every student with the details the list and the payment matcher need. */
export async function adminListStudentRecordsCore(deps) {
  const { db } = deps;
  const [users, students, records, enrolments, applications] = await Promise.all([
    db.collection('users').where('role', '==', 'student').limit(MAX_STUDENTS).get(),
    db.collection('students').limit(MAX_STUDENTS).get(),
    db.collection('studentRecords').limit(MAX_STUDENTS).get(),
    db.collection('enrolments').limit(MAX_STUDENTS * 4).get(),
    db.collection('applications').where('status', '==', 'approved').limit(MAX_STUDENTS).get(),
  ]);
  const byId = (snapshot) => new Map(snapshot.docs.map((entry) => [entry.id, entry.data()]));
  const studentById = byId(students);
  const recordById = byId(records);
  const applicationById = byId(applications);
  const programmesByStudent = new Map();
  for (const entry of enrolments.docs) {
    const { studentId, programmeId } = entry.data();
    if (!studentId || !programmeId) continue;
    programmesByStudent.set(studentId, [...(programmesByStudent.get(studentId) ?? []), programmeId]);
  }
  const list = users.docs.map((entry) => {
    const user = entry.data();
    return forList(mergeStudentRecord({
      uid: entry.id,
      user,
      student: studentById.get(entry.id) ?? {},
      application: applicationById.get(user.applicationId) ?? null,
      record: recordById.get(entry.id) ?? null,
      programmeIds: programmesByStudent.get(entry.id) ?? [],
    }));
  });
  return { students: list.sort((a, b) => a.displayName.localeCompare(b.displayName)), truncated: users.docs.length >= MAX_STUDENTS };
}

export async function adminGetStudentRecordCore(deps, { data }) {
  const uid = typeof data?.uid === 'string' ? data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Choose a student.');
  const parts = await loadOne(deps, uid);
  return { record: forDetail(mergeStudentRecord({ uid, ...parts })) };
}

async function assertNumberFree(db, number, uid) {
  if (!number) return;
  const [records, applications] = await Promise.all([
    db.collection('studentRecords').where('studentNumber', '==', number).get(),
    db.collection('applications').where('reference', '==', number).get(),
  ]);
  const takenByRecord = records.docs.some((entry) => entry.id !== uid);
  const takenByApplication = applications.docs.some((entry) => entry.data().userId && entry.data().userId !== uid);
  if (takenByRecord || takenByApplication) {
    throw new HttpsError('already-exists', 'That student number belongs to another student.', { fieldErrors: { studentNumber: 'That student number belongs to another student.' } });
  }
}

const sameValue = (a, b) => (a ?? '') === (b ?? '');

/** Saves an administrator's edits and keeps the places that show the name and contacts in step. */
export async function adminSaveStudentRecordCore(deps, { actor, data, now = new Date() }) {
  const { db, FieldValue, audit, auth, log } = deps;
  const uid = typeof data?.uid === 'string' ? data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Choose a student.');

  const { ok, value, errors } = validateStudentRecord(data?.record, { now });
  if (!ok) {
    const message = Object.values(errors)[0] || 'Check the student details.';
    throw new HttpsError('invalid-argument', message, { fieldErrors: errors });
  }

  const parts = await loadOne(deps, uid);
  const before = mergeStudentRecord({ uid, ...parts });
  await assertNumberFree(db, value.studentNumber, uid);

  const recordRef = db.collection('studentRecords').doc(uid);
  const stored = { ...value, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
  if (!parts.record) stored.createdAt = FieldValue.serverTimestamp();
  await recordRef.set(stored, { merge: true });

  const after = mergeStudentRecord({ uid, ...parts, record: { ...(parts.record ?? {}), ...value } });
  const changed = STUDENT_RECORD_FIELDS.filter((key) => !sameValue(before[key], after[key]));

  // Everything below only mirrors the saved record. A failure here must not undo or hide the save.
  const warnings = [];
  const displayName = after.displayName;
  try {
    const profile = { ...(parts.student.profile ?? {}) };
    for (const key of ['firstName', 'middleName', 'surname', 'dateOfBirth', 'gender', 'phoneNumber', 'nationality']) profile[key] = after[key];
    profile.guardian = { ...(profile.guardian ?? {}) };
    for (const [from, to] of Object.entries(GUARDIAN_KEYS)) profile.guardian[to] = after[from];
    if (Object.keys(parts.student).length) await db.collection('students').doc(uid).update({
      profile, displayName, feeDueMinor: Number.isInteger(after.feeDueMinor) ? after.feeDueMinor : null, updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(uid).update({ displayName });
    if (auth?.updateUser && displayName && displayName !== parts.user.displayName) await auth.updateUser(uid, { displayName });
  } catch (error) {
    warnings.push('The name was saved on the record but could not be copied to the account.');
    log?.warn?.('student record sync failed', { uid, error: String(error) });
  }

  // The log names what changed, never the values: identification numbers do not belong in a log.
  await audit({
    actorId: actor.uid,
    action: 'student.update',
    resource: { type: 'student', id: uid },
    metadata: { fields: changed },
  });
  return { record: forDetail({ ...after, updatedAt: now.toISOString() }), changed, warnings };
}

export const adminListStudentRecords = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  await requireRole(request, ['admin'], deps);
  return adminListStudentRecordsCore(deps);
});

export const adminGetStudentRecord = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  await requireRole(request, ['admin'], deps);
  return adminGetStudentRecordCore(deps, { data: request.data });
});

export const adminSaveStudentRecord = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminSaveStudentRecordCore(deps, { actor, data: request.data });
});
