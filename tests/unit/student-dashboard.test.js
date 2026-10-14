// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import programmes from '../../src/data/programmes.json';
import { loadPage, tick } from '../helpers.js';

const getDoc = vi.fn();
const getDocs = vi.fn();
const loadOverview = vi.fn();
const loadMyClasses = vi.fn();
const listPublicProgrammes = vi.fn();
const updateStudentDoc = vi.fn();
const sendEmailVerification = vi.fn();
const requestPasswordReset = vi.fn();
const uploadBytes = vi.fn();
const deleteObject = vi.fn();
const getDownloadURL = vi.fn();
const storageRef = vi.fn();
const listMyPrivacyRequests = vi.fn();
const submitPrivacyRequest = vi.fn();
let studentRecord;
let accountRecord;
let applicationRecord;
let enrolmentRecords;

vi.mock('firebase/firestore', () => ({
  collection: (_db, path) => ({ path }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc: (...args) => getDoc(...args),
  getDocs: (...args) => getDocs(...args),
  query: (collectionRef, ...constraints) => ({ collection: collectionRef, constraints }),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  updateDoc: (...args) => updateStudentDoc(...args),
  where: (field, op, value) => ({ field, op, value }),
}));
vi.mock('firebase/auth', () => ({ sendEmailVerification: (...args) => sendEmailVerification(...args) }));
vi.mock('firebase/storage', () => ({
  deleteObject: (...args) => deleteObject(...args),
  getDownloadURL: (...args) => getDownloadURL(...args),
  ref: (...args) => storageRef(...args),
  uploadBytes: (...args) => uploadBytes(...args),
}));
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'stu1', displayName: 'Amina Otieno', email: 'amina@example.test', emailVerified: true } }) }));
vi.mock('@/services/firebase-db.js', () => ({ dbService: () => ({}) }));
vi.mock('@/services/firebase-storage.js', () => ({ storageService: () => ({}) }));
vi.mock('@/services/password-service.js', () => ({ requestPasswordReset: (...args) => requestPasswordReset(...args) }));
vi.mock('@/services/schedule-service.js', () => ({ loadMyClasses: (...args) => loadMyClasses(...args) }));
vi.mock('@/services/programme-service.js', () => ({ listPublicProgrammes: (...args) => listPublicProgrammes(...args) }));
vi.mock('@/practice/overview.js', () => ({ loadOverview: (...args) => loadOverview(...args) }));
vi.mock('@/services/privacy-request-service.js', () => ({
  listMyPrivacyRequests: (...args) => listMyPrivacyRequests(...args),
  submitPrivacyRequest: (...args) => submitPrivacyRequest(...args),
}));
vi.mock('@/practice/engine.js', () => ({ pickContinue: vi.fn().mockReturnValue(null) }));
vi.mock('@/ui/portal-shell.js', () => ({ mountPortalShell: vi.fn() }));
vi.mock('@/ui/notification-badge.js', () => ({ mountNotificationBadge: vi.fn() }));

const snapshot = (record) => ({ exists: () => record !== null, data: () => record });
const enrollmentDocs = () => enrolmentRecords.map((record, index) => ({ id: `e${index}`, data: () => record }));

async function open(hash = '') {
  vi.resetModules();
  loadPage('student/dashboard.html');
  window.history.replaceState({}, '', `/student/dashboard${hash}`);
  await import('@/pages/student-dashboard.js');
  await tick();
}

const fullProfile = () => ({
  firstName: 'Amina', middleName: 'Wanjiku', surname: 'Otieno', dateOfBirth: '2004-05-12',
  gender: 'female', phoneNumber: '+254700000001', nationality: 'kenyan', applicationReference: 'CFL-2026-00124',
  guardian: { name: 'Jane Otieno', relationship: 'parent', phoneNumber: '+254700000002', emergencyContact: 'Jane Otieno' },
});
const futureClass = () => ({
  id: 'class1', programmeId: 'english-beginner-1', title: 'Speaking practice',
  startsAtMs: Date.now() + 86_400_000, endsAtMs: Date.now() + 90_000_000,
  mode: 'in_person', location: 'Room 2', instructorName: 'Jane Doe', joinLink: null, notes: '', cancelled: false,
});

beforeEach(() => {
  studentRecord = { displayName: 'Amina Otieno', profile: fullProfile() };
  accountRecord = { displayName: 'Amina Otieno', status: 'active', applicationId: 'app1' };
  applicationRecord = {
    reference: 'CFL-2026-00124', status: 'approved', programmeId: 'english-beginner-1',
    applicant: { firstName: 'Registration', middleName: 'Form', surname: 'Record', dateOfBirth: '2004-05-12', gender: 'female', phoneNumber: '+254700000001', nationality: 'kenyan' },
    guardian: { name: 'Jane Otieno', relationship: 'parent', phoneNumber: '+254700000002', emergencyContact: 'Jane Otieno' },
  };
  enrolmentRecords = [{ studentId: 'stu1', programmeId: 'english-beginner-1', status: 'active', createdAt: new Date('2026-09-01T00:00:00Z') }];
  getDoc.mockReset().mockImplementation(async (ref) => {
    if (ref.path === 'students/stu1') return snapshot(studentRecord);
    if (ref.path === 'users/stu1') return snapshot(accountRecord);
    if (ref.path === 'applications/app1') return snapshot(applicationRecord);
    return snapshot(null);
  });
  getDocs.mockReset().mockImplementation(async (queryRef) => ({ docs: queryRef.collection.path === 'enrolments' ? enrollmentDocs() : [] }));
  updateStudentDoc.mockReset().mockResolvedValue();
  sendEmailVerification.mockReset().mockResolvedValue();
  requestPasswordReset.mockReset().mockResolvedValue();
  uploadBytes.mockReset().mockResolvedValue({ ref: { id: 'avatar-ref' } });
  deleteObject.mockReset().mockResolvedValue();
  getDownloadURL.mockReset().mockResolvedValue('https://storage.example.test/student-avatar');
  storageRef.mockReset().mockReturnValue({ path: 'users/stu1/avatar/profile' });
  loadOverview.mockReset().mockResolvedValue({ entries: [] });
  loadMyClasses.mockReset().mockResolvedValue({ classes: [futureClass()], programmeIds: ['english-beginner-1'] });
  listPublicProgrammes.mockReset().mockResolvedValue(programmes);
  listMyPrivacyRequests.mockReset().mockResolvedValue([]);
  submitPrivacyRequest.mockReset().mockResolvedValue({ requestId: 'request12345678', status: 'submitted' });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('student dashboard', () => {
  it('omits the academic record and student documents sections', async () => {
    await open();
    expect(document.getElementById('academicRecordTitle')).toBeNull();
    expect(document.getElementById('documentsTitle')).toBeNull();
    expect(document.getElementById('completionTitle')).toBeNull();
    expect(document.getElementById('feesTitle')).not.toBeNull();
  });

  it('opens Privacy & Data and submits a personal-data access request', async () => {
    await open();
    document.getElementById('openPrivacyData').click();
    expect(document.getElementById('studentSettingsContent').hidden).toBe(true);
    expect(document.getElementById('privacyDataPanel').hidden).toBe(false);
    document.querySelector('[data-privacy-request="data_access"]').click();
    expect(document.getElementById('privacyRequestTitle').textContent).toBe('Request my data');
    expect(document.getElementById('privacyRequestDetails').required).toBe(false);
    document.getElementById('privacyRequestForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(submitPrivacyRequest).toHaveBeenCalledWith({ requestType: 'data_access', correctionCategory: '', details: '' }));
    expect(document.getElementById('privacyPanelNote').textContent).toContain('submitted for CFL review');
  });

  it('submits correction category and details, and shows review status and next action', async () => {
    listMyPrivacyRequests.mockResolvedValue([{
      id: 'request12345678', requestType: 'correction', correctionCategory: 'legal_identity', details: 'Correct my surname',
      status: 'needs_student', response: 'Please provide a verified document.', nextAction: 'Reply with proof of legal name.',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updates: [{ status: 'needs_student', response: 'Please provide a verified document.', nextAction: 'Reply with proof of legal name.', reviewedAt: new Date('2026-10-02T00:00:00Z') }],
    }]);
    await open();
    document.getElementById('openPrivacyData').click();
    document.querySelector('[data-privacy-request="correction"]').click();
    document.getElementById('correctionCategory').value = 'legal_identity';
    document.getElementById('privacyRequestDetails').value = 'Correct my legal surname';
    document.getElementById('privacyRequestForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(submitPrivacyRequest).toHaveBeenCalledWith({
      requestType: 'correction', correctionCategory: 'legal_identity', details: 'Correct my legal surname',
    }));
    await vi.waitFor(() => expect(document.getElementById('privacyRequestList').textContent).toContain('Reply with proof of legal name.'));
    expect(document.getElementById('privacyRequestList').textContent).toContain('Action needed');
    expect(document.getElementById('privacyRequestList').textContent).toContain('Please provide a verified document.');
    expect(document.getElementById('privacyRequestList').textContent).toContain('Action needed');
  });

  it('lets a student choose a deletion, objection, or restriction request', async () => {
    await open();
    document.getElementById('openPrivacyData').click();
    document.querySelector('[data-privacy-request="other"]').click();
    expect(document.getElementById('otherPrivacyTypeGroup').hidden).toBe(false);
    document.getElementById('otherPrivacyType').value = 'restriction';
    document.getElementById('privacyRequestDetails').value = 'Please restrict processing of my contact details.';
    document.getElementById('privacyRequestForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(submitPrivacyRequest).toHaveBeenCalledWith({
      requestType: 'restriction', correctionCategory: '', details: 'Please restrict processing of my contact details.',
    }));
  });

  it('opens account settings when entered from the Settings navigation link', async () => {
    const showModal = vi.fn(function show() { this.open = true; });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
    await open('#settings');
    expect(showModal).toHaveBeenCalledOnce();
    expect(document.getElementById('studentSettingsDialog').open).toBe(true);
    delete HTMLDialogElement.prototype.showModal;
  });

  it('shows active enrollment, student number, application state, and next class', async () => {
    await open();
    expect(document.getElementById('studentStage').textContent).toBe('Active student');
    expect(document.getElementById('studentNumber').textContent).toContain('CFL-2026-00124');
    expect(document.getElementById('enrolmentDetails').textContent).toContain(programmes[1].name);
    expect(document.getElementById('enrolmentDetails').textContent).toContain('Active');
    expect(document.querySelector('.student-enrolment-status').classList.contains('status-active')).toBe(true);
    expect(document.querySelectorAll('.student-enrolment-fact')).toHaveLength(3);
    expect(document.getElementById('applicationStatus').textContent).toBe('Approved');
    expect(document.getElementById('nextClassContent').textContent).toContain('Speaking practice');
    expect(document.querySelectorAll('.student-quick-link-icon svg')).toHaveLength(3);
  });

  it('uses registration-submitted identity ahead of the copied student profile', async () => {
    studentRecord.profile.firstName = 'Stale';
    studentRecord.profile.surname = 'Copy';
    await open();
    expect(document.getElementById('studentDetails').textContent).toContain('Registration Form Record');
    expect(document.getElementById('studentDetails').textContent).not.toContain('Stale Copy');
    expect(document.getElementById('studentNumber').textContent).toContain(applicationRecord.reference);
  });

  it('lets a student switch between multiple enrollment records', async () => {
    enrolmentRecords = [
      { studentId: 'stu1', programmeId: 'english-beginner-1', status: 'active' },
      { studentId: 'stu1', programmeId: 'english-intermediate', status: 'pending_start' },
    ];
    await open();
    const picker = document.getElementById('enrolmentPicker');
    expect(picker.hidden).toBe(false);
    picker.value = '1';
    picker.dispatchEvent(new Event('change'));
    expect(document.getElementById('enrolmentDetails').textContent).toContain(programmes[3].name);
    expect(document.getElementById('enrolmentDetails').textContent).toContain('Starting soon');
    expect(document.querySelector('.student-enrolment-status').classList.contains('status-pending_start')).toBe(true);
  });

  it('positions the compact programme action below the no-enrollment message', async () => {
    enrolmentRecords = [];
    await open();
    const details = document.getElementById('enrolmentDetails');
    const action = details.querySelector('a');
    expect(details.classList.contains('is-empty')).toBe(true);
    expect(action.textContent).toBe('View programmes');
    expect(action.classList.contains('student-compact-action')).toBe(true);
  });

  it('shows profile completion only for missing required details', async () => {
    await open();
    expect(document.getElementById('profileCompletion').hidden).toBe(true);
    applicationRecord.applicant = { firstName: 'Amina' };
    applicationRecord.guardian = {};
    studentRecord = { displayName: 'Amina Otieno', profile: { firstName: 'Amina' } };
    await open();
    expect(document.getElementById('profileCompletion').hidden).toBe(false);
    expect(document.getElementById('profileCompletionText').textContent).toContain('Date of birth');
  });

  it('distinguishes admitted students from active learners and graduates', async () => {
    enrolmentRecords = [{ studentId: 'stu1', programmeId: 'english-beginner-1', status: 'pending_start' }];
    await open();
    expect(document.getElementById('studentStage').textContent).toBe('Admitted');
    enrolmentRecords = [{ studentId: 'stu1', programmeId: 'english-beginner-1', status: 'completed' }];
    await open();
    expect(document.getElementById('studentStage').textContent).toBe('Graduate / Alumni');
  });

  it('keeps private identity and emergency details collapsed by default', async () => {
    await open();
    expect(document.getElementById('studentDetails').textContent).toContain('Registration Form Record');
    expect(document.getElementById('studentDetails').textContent).not.toContain('2004');
    expect(document.getElementById('studentDetails').textContent).not.toContain('+254700000001');
    expect(document.getElementById('sensitiveDetails').open).toBe(false);
    expect(document.getElementById('privateStudentDetails').textContent).toContain('+254700000001');
  });

  it('saves preferences and applies reduced motion immediately', async () => {
    delete document.documentElement.dataset.reduceMotion;
    await open();
    document.getElementById('preferredLanguage').value = 'sw';
    document.getElementById('emailUpdates').checked = true;
    document.getElementById('reduceMotion').checked = true;
    document.getElementById('studentPreferencesForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(updateStudentDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'students/stu1' }),
      expect.objectContaining({ preferences: expect.objectContaining({ preferredLanguage: 'sw', emailUpdates: true, reduceMotion: true }) }),
    );
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('shows class reminders as on unless the student switched them off, and saves a switch-off', async () => {
    await open();
    expect(document.getElementById('classReminders').checked).toBe(true);
    document.getElementById('classReminders').checked = false;
    document.getElementById('studentPreferencesForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(updateStudentDoc).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: 'students/stu1' }),
      expect.objectContaining({ preferences: expect.objectContaining({ classReminders: false }) }),
    );
  });

  it('sends password reset and email verification links from account settings', async () => {
    await open();
    document.getElementById('sendPasswordReset').click();
    expect(requestPasswordReset).toHaveBeenCalledWith('amina@example.test');
    const verification = document.getElementById('sendVerificationEmail');
    verification.hidden = false;
    verification.click();
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('uploads a profile image to the private student avatar path and saves its URL', async () => {
    await open();
    const picker = document.getElementById('studentAvatarUpload');
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    picker.dispatchEvent(new Event('change'));
    await tick();
    expect(storageRef).toHaveBeenCalledWith(expect.anything(), 'users/stu1/avatar/profile');
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), file, { contentType: 'image/webp' });
    expect(updateStudentDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'students/stu1' }),
      expect.objectContaining({ profile: expect.objectContaining({ photoURL: 'https://storage.example.test/student-avatar' }) }),
    );
    expect(document.getElementById('studentAvatar').hidden).toBe(false);
  });

  it('removes the profile photo object and clears its saved URL after confirmation', async () => {
    studentRecord.profile.photoURL = 'https://storage.example.test/student-avatar';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await open();
    const button = document.getElementById('removeStudentAvatar');
    expect(button.hidden).toBe(false);
    button.click();
    await vi.waitFor(() => expect(deleteObject).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/stu1/avatar/profile' })));
    await vi.waitFor(() => expect(updateStudentDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'students/stu1' }),
      expect.objectContaining({ profile: expect.not.objectContaining({ photoURL: expect.anything() }) }),
    ));
    await vi.waitFor(() => expect(button.hidden).toBe(true));
    expect(document.getElementById('studentAvatar').hidden).toBe(true);
    expect(document.getElementById('studentAvatarInitials').hidden).toBe(false);
  });

  it('keeps the profile photo when removal is cancelled', async () => {
    studentRecord.profile.photoURL = 'https://storage.example.test/student-avatar';
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open();
    document.getElementById('removeStudentAvatar').click();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(updateStudentDoc).not.toHaveBeenCalled();
  });
});
