import { describe, expect, it, vi } from 'vitest';
import {
  adminGetStudentRecordCore, adminListStudentRecordsCore, adminSaveStudentRecordCore, mergeStudentRecord,
} from '../../functions/src/admin/student-records.js';
import { fakeAuth, fakeDb, fakeFieldValue } from './helpers/fakes.js';

const actor = { uid: 'admin1', role: 'admin' };
const now = new Date('2026-10-15T09:00:00.000Z');

const application = {
  reference: 'CFL-2026-00001',
  email: 'amina@example.test',
  status: 'approved',
  userId: 'stu1',
  applicant: {
    firstName: 'Amina', middleName: 'W', surname: 'Kamau', dateOfBirth: '2004-03-09', gender: 'female', nationality: 'Kenyan',
    phoneNumber: '+254700000001', residentialAddress: 'Kitui Town', countryOfResidence: 'Kenya',
    identityDocument: { type: 'national_id', number: '12345678' },
    academicBackground: { highestQualification: 'secondary', institutionAttended: 'Kitui High School', completionYear: 2022 },
  },
  contactPerson: { name: 'Grace Kamau', relationship: 'parent', phoneNumber: '+254700000002' },
};

function setup() {
  const db = fakeDb();
  db.store.set('users/stu1', {
    uid: 'stu1', role: 'student', status: 'active', email: 'amina@example.test', displayName: 'Amina Kamau', applicationId: 'app1',
  });
  db.store.set('users/stu2', { uid: 'stu2', role: 'student', status: 'invited', email: 'brian@example.test', displayName: 'Brian Otieno' });
  db.store.set('users/ins1', { uid: 'ins1', role: 'instructor', status: 'active', email: 'teacher@example.test', displayName: 'Ms Otieno' });
  db.store.set('students/stu1', {
    displayName: 'Amina Kamau', profile: { firstName: 'Amina', surname: 'Kamau', guardian: { name: 'Grace Kamau', emergencyContact: 'Grace' }, photoURL: 'p.png' },
  });
  db.store.set('students/stu2', { displayName: 'Brian Otieno', profile: { firstName: 'Brian', surname: 'Otieno' } });
  db.store.set('applications/app1', application);
  db.store.set('enrolments/stu1_english-intake', { studentId: 'stu1', programmeId: 'english-intake' });
  const auth = fakeAuth([{ uid: 'stu1', email: 'amina@example.test', displayName: 'Amina Kamau' }]);
  return { db, auth, FieldValue: fakeFieldValue(), audit: vi.fn(), log: { warn: vi.fn() } };
}

describe('merging what we know about a student', () => {
  it('uses the application ahead of the student-editable profile', () => {
    const merged = mergeStudentRecord({
      uid: 'stu1',
      user: { status: 'active', email: 'a@x.test' },
      student: { profile: { firstName: 'Edited By Student', phoneNumber: '+254799999999' } },
      application,
    });
    expect(merged.firstName).toBe('Amina');
    expect(merged.phoneNumber).toBe('+254700000001');
    expect(merged.identificationNumber).toBe('12345678');
    expect(merged.studentNumber).toBe('CFL-2026-00001');
    expect(merged.displayName).toBe('Amina Kamau');
  });

  it('treats a saved record as the whole truth, including a field the administrator cleared', () => {
    const merged = mergeStudentRecord({
      uid: 'stu1', user: {}, application, record: { firstName: 'Amina', surname: 'Kamau', phoneNumber: '', studentNumber: 'CFL-77' },
    });
    expect(merged.phoneNumber).toBe('');
    expect(merged.studentNumber).toBe('CFL-77');
    // A field the saved record has no entry for at all (never edited, or added to the editor later) still
    // shows what the application said, so a new field can never blank out existing students.
    expect(merged.residentialAddress).toBe('Kitui Town');
  });

  it('keeps a field blank once an administrator has saved it as blank', () => {
    const merged = mergeStudentRecord({ uid: 'stu1', user: {}, application, record: { residentialAddress: '' } });
    expect(merged.residentialAddress).toBe('');
  });

  it('still describes a student who never had an application', () => {
    const merged = mergeStudentRecord({ uid: 'x', user: { displayName: 'Walk In', status: 'active' }, student: {} });
    expect(merged).toMatchObject({ displayName: 'Walk In', studentNumber: '', feeDueMinor: null, programmeIds: [] });
  });
});

describe('listing student records', () => {
  it('lists students only, sorted by name, with programmes, and keeps identification numbers out of the list', async () => {
    const deps = setup();
    const { students, truncated } = await adminListStudentRecordsCore(deps);
    expect(truncated).toBe(false);
    expect(students.map((student) => student.uid)).toEqual(['stu1', 'stu2']);
    expect(students[0]).toMatchObject({ displayName: 'Amina Kamau', studentNumber: 'CFL-2026-00001', programmeIds: ['english-intake'], hasIdentification: true });
    expect(students[0]).not.toHaveProperty('identificationNumber');
    expect(JSON.stringify(students)).not.toContain('12345678');
    expect(students[1]).toMatchObject({ accountStatus: 'invited', hasIdentification: false });
  });

  it('returns the full record, including the identification number, when one student is opened', async () => {
    const { record } = await adminGetStudentRecordCore(setup(), { data: { uid: 'stu1' } });
    expect(record).toMatchObject({ identificationType: 'national_id', identificationNumber: '12345678', contactName: 'Grace Kamau' });
  });

  it('refuses an account that is not a student', async () => {
    await expect(adminGetStudentRecordCore(setup(), { data: { uid: 'ins1' } })).rejects.toMatchObject({ code: 'not-found' });
    await expect(adminGetStudentRecordCore(setup(), { data: { uid: 'nobody' } })).rejects.toMatchObject({ code: 'not-found' });
    await expect(adminGetStudentRecordCore(setup(), { data: {} })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('saving a student record', () => {
  const edit = (overrides = {}) => ({
    uid: 'stu1',
    record: {
      firstName: 'Amina', middleName: 'Wanjiru', surname: 'Kamau-Mutua', dateOfBirth: '2004-03-09', gender: 'female', nationality: 'Kenyan',
      phoneNumber: '0711 222 333', residentialAddress: 'Mwingi Road, Kitui', countryOfResidence: 'Kenya',
      contactName: 'Grace Kamau', contactRelationship: 'parent', contactPhone: '0700 000 002',
      highestQualification: 'secondary', institutionAttended: 'Kitui High School', completionYear: 2022,
      identificationType: 'national_id', identificationNumber: '12345678', studentNumber: '', feeDueMinor: 4500000,
      ...overrides,
    },
  });

  it('saves the record, normalises phones, and keeps the name in step on the account', async () => {
    const deps = setup();
    const result = await adminSaveStudentRecordCore(deps, { actor, data: edit(), now });
    const saved = deps.db.store.get('studentRecords/stu1');
    expect(saved).toMatchObject({ surname: 'Kamau-Mutua', phoneNumber: '+254711222333', feeDueMinor: 4500000, updatedBy: 'admin1', createdAt: 'SERVER_TS' });
    expect(result.record).toMatchObject({ displayName: 'Amina Kamau-Mutua', studentNumber: 'CFL-2026-00001', feeDueMinor: 4500000 });
    expect(deps.db.store.get('users/stu1').displayName).toBe('Amina Kamau-Mutua');
    expect(deps.db.store.get('students/stu1')).toMatchObject({ displayName: 'Amina Kamau-Mutua' });
    expect(deps.db.store.get('students/stu1').profile).toMatchObject({
      surname: 'Kamau-Mutua', phoneNumber: '+254711222333', photoURL: 'p.png', guardian: { name: 'Grace Kamau', emergencyContact: 'Grace' },
    });
    expect(deps.auth.users.get('stu1').displayName).toBe('Amina Kamau-Mutua');
    expect(result.warnings).toEqual([]);
  });

  it('writes an audit entry that names the fields that changed and never their values', async () => {
    const deps = setup();
    const { changed } = await adminSaveStudentRecordCore(deps, { actor, data: edit(), now });
    expect(changed).toEqual(expect.arrayContaining(['middleName', 'surname', 'phoneNumber', 'residentialAddress', 'feeDueMinor']));
    expect(changed).not.toContain('firstName');
    expect(changed).not.toContain('identificationNumber');
    const entry = deps.audit.mock.calls[0][0];
    expect(entry).toMatchObject({ actorId: 'admin1', action: 'student.update', resource: { type: 'student', id: 'stu1' } });
    expect(JSON.stringify(entry)).not.toContain('12345678');
    expect(JSON.stringify(entry)).not.toContain('Mutua');
  });

  it('lets an administrator clear an optional detail and does not bring the old value back', async () => {
    const deps = setup();
    await adminSaveStudentRecordCore(deps, { actor, data: edit({ phoneNumber: '', residentialAddress: '' }), now });
    const { record } = await adminGetStudentRecordCore(deps, { data: { uid: 'stu1' } });
    expect(record.phoneNumber).toBe('');
    expect(record.residentialAddress).toBe('');
  });

  it('needs only a name, so an older record with gaps can still be fixed', async () => {
    const deps = setup();
    const data = { uid: 'stu2', record: { firstName: 'Brian', surname: 'Otieno' } };
    const result = await adminSaveStudentRecordCore(deps, { actor, data, now });
    expect(result.record).toMatchObject({ displayName: 'Brian Otieno', phoneNumber: '', feeDueMinor: null });
  });

  it('rejects bad details with a message for each field and saves nothing', async () => {
    const deps = setup();
    const error = await adminSaveStudentRecordCore(deps, {
      actor, data: edit({ surname: '', phoneNumber: '123', gender: 'robot', completionYear: 2099, identificationNumber: '' }), now,
    }).catch((caught) => caught);
    expect(error.code).toBe('invalid-argument');
    expect(Object.keys(error.details.fieldErrors)).toEqual(expect.arrayContaining(['surname', 'phoneNumber', 'gender', 'completionYear', 'identificationNumber']));
    expect(deps.db.store.has('studentRecords/stu1')).toBe(false);
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it('keeps student numbers unique, against saved records and against application references', async () => {
    const deps = setup();
    deps.db.store.set('studentRecords/stu2', { firstName: 'Brian', surname: 'Otieno', studentNumber: 'CFL-500' });
    await expect(adminSaveStudentRecordCore(deps, { actor, data: edit({ studentNumber: 'cfl-500' }), now })).rejects.toMatchObject({
      code: 'already-exists', details: { fieldErrors: { studentNumber: expect.any(String) } },
    });
    deps.db.store.set('applications/app2', { reference: 'CFL-2026-00002', userId: 'stu2', status: 'approved' });
    await expect(adminSaveStudentRecordCore(deps, { actor, data: edit({ studentNumber: 'CFL-2026-00002' }), now })).rejects.toMatchObject({ code: 'already-exists' });
    // a student's own number is never a clash with themselves
    await expect(adminSaveStudentRecordCore(deps, { actor, data: edit({ studentNumber: 'CFL-2026-00001' }), now })).resolves.toBeTruthy();
    await expect(adminSaveStudentRecordCore(deps, { actor, data: edit({ studentNumber: 'cfl-501' }), now })).resolves.toMatchObject({ record: { studentNumber: 'CFL-501' } });
  });

  it('cannot edit an instructor or an unknown account through the student editor', async () => {
    const deps = setup();
    await expect(adminSaveStudentRecordCore(deps, { actor, data: { ...edit(), uid: 'ins1' }, now })).rejects.toMatchObject({ code: 'not-found' });
    await expect(adminSaveStudentRecordCore(deps, { actor, data: { ...edit(), uid: '' }, now })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('never changes the login email, even if one is sent', async () => {
    const deps = setup();
    await adminSaveStudentRecordCore(deps, { actor, data: { ...edit(), record: { ...edit().record, email: 'hacker@example.test' } }, now });
    expect(deps.db.store.get('users/stu1').email).toBe('amina@example.test');
    expect(deps.db.store.get('studentRecords/stu1')).not.toHaveProperty('email');
  });

  it('still saves, and says so, when copying the name to the account fails', async () => {
    const deps = setup();
    deps.db.store.delete('users/stu1'); // the user document is what the sync updates; make that step fail after the read
    deps.db.store.set('users/stu1', { uid: 'stu1', role: 'student', status: 'active', applicationId: 'app1' });
    deps.auth.updateUser = vi.fn(async () => { throw new Error('auth down'); });
    const result = await adminSaveStudentRecordCore(deps, { actor, data: edit(), now });
    expect(deps.db.store.get('studentRecords/stu1').surname).toBe('Kamau-Mutua');
    expect(result.warnings).toHaveLength(1);
    expect(deps.audit).toHaveBeenCalled();
  });
});
