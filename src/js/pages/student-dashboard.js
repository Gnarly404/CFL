import { sendEmailVerification } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { guardPage } from '@/auth/guards.js';
import { dbService } from '@/services/firebase-db.js';
import { el, setBusy } from '@/utils/dom.js';
import { ROUTES } from '@/core/routes.js';
import { lessonUrl } from '@/practice/content.js';
import { pickContinue } from '@/practice/engine.js';
import { loadOverview } from '@/practice/overview.js';
import { formatDay, modeLabel, nextClass, splitClasses, describeWhen } from '@/schedule/state.js';
import { loadMyClasses } from '@/services/schedule-service.js';
import { storageService } from '@/services/firebase-storage.js';
import { requestPasswordReset } from '@/services/password-service.js';
import { listPublicProgrammes } from '@/services/programme-service.js';
import fallbackProgrammes from '../../data/programmes.json';
import { PROGRAMME_GROUP_LABELS } from '@/utils/programme-schema.js';
import { enrollmentStatusLabel, legalName, missingRequiredProfileFields } from '@/student/dashboard.js';
import { STATUS_LABELS } from '@/utils/application-status.js';
import { h } from '@/ui/h.js';
import { icon } from '@/ui/icons.js';
import { mountPortalShell } from '@/ui/portal-shell.js';
import { mountNotificationBadge } from '@/ui/notification-badge.js';
import { setReduceMotionPreference } from '@/motion/reduced-motion.js';
import { listMyPrivacyRequests, submitPrivacyRequest } from '@/services/privacy-request-service.js';

mountPortalShell('dashboard');
const session = await guardPage({ roles: ['student'] });
mountNotificationBadge(session.user.uid);
document.querySelectorAll('[data-student-link-icon]').forEach((node) => {
  node.replaceChildren(icon(node.dataset.studentLinkIcon, { size: 22 }));
});
const studentSettingsDialog = document.getElementById('studentSettingsDialog');
const openSettingsFromLocation = () => {
  if (window.location.hash === '#settings' && studentSettingsDialog && !studentSettingsDialog.open) studentSettingsDialog.showModal?.();
};
studentSettingsDialog?.addEventListener('click', (event) => {
  if (event.target === studentSettingsDialog) studentSettingsDialog.close?.();
});
studentSettingsDialog?.addEventListener('close', () => {
  if (window.location.hash === '#settings') window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
});
window.addEventListener('hashchange', openSettingsFromLocation);
openSettingsFromLocation();
const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
const dayMessage = document.getElementById('dayMessage');
if (dayMessage) dayMessage.textContent = `${greeting}. Here is what you can work on today.`;

const nameEl = document.getElementById('studentName');
const studentNumberEl = document.getElementById('studentNumber');
const profileStatusEl = document.getElementById('profileStatus');
const emailVerificationEl = document.getElementById('emailVerification');
const studentDetailsEl = document.getElementById('studentDetails');
const privateStudentDetailsEl = document.getElementById('privateStudentDetails');
const sensitiveDetailsEl = document.getElementById('sensitiveDetails');
const profileCompletionEl = document.getElementById('profileCompletion');
const profileCompletionTextEl = document.getElementById('profileCompletionText');
const enrolmentPickerWrapEl = document.getElementById('enrolmentPickerWrap');
const enrolmentPickerEl = document.getElementById('enrolmentPicker');
const enrolmentDetailsEl = document.getElementById('enrolmentDetails');
const enrolmentHistoryNoteEl = document.getElementById('enrolmentHistoryNote');
const nextClassContentEl = document.getElementById('nextClassContent');
const applicationCardEl = document.getElementById('applicationCard');
const applicationStatusEl = document.getElementById('applicationStatus');
const applicationReferenceEl = document.getElementById('applicationReference');
const dashboardNoteEl = document.getElementById('studentDashboardNote');
const avatarEl = document.getElementById('studentAvatar');
const avatarInitialsEl = document.getElementById('studentAvatarInitials');
const avatarUploadEl = document.getElementById('studentAvatarUpload');
const removeAvatarButtonEl = document.getElementById('removeStudentAvatar');
const accountSettingsNoteEl = document.getElementById('accountSettingsNote');
const formatStatus = (status, fallback = 'Pending') => {
  if (typeof status !== 'string' || !status) return fallback;
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ').replace(/^[a-z]/, (letter) => letter.toUpperCase());
};
const displayDate = (value) => {
  const date = value?.toDate?.() ?? (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};
const fact = (label, value) => (value ? [el('dt', {}, label), el('dd', {}, value)] : []);
const setDashboardNote = (text) => {
  dashboardNoteEl.hidden = !text;
  dashboardNoteEl.textContent = text;
};

let studentRecord = null;
let accountRecord = {};
let application = null;
let enrolments = [];
try {
  const db = dbService();
  const [studentSnap, accountSnap, enrolmentSnap] = await Promise.all([
    getDoc(doc(db, 'students', session.user.uid)),
    getDoc(doc(db, 'users', session.user.uid)),
    getDocs(query(collection(db, 'enrolments'), where('studentId', '==', session.user.uid))),
  ]);
  studentRecord = studentSnap.exists() ? studentSnap.data() : null;
  accountRecord = accountSnap.exists() ? accountSnap.data() : {};
  enrolments = enrolmentSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

  if (accountRecord.applicationId) {
    try {
      const applicationSnap = await getDoc(doc(db, 'applications', accountRecord.applicationId));
      application = applicationSnap.exists() ? applicationSnap.data() : null;
    } catch (error) {
      console.warn('Could not load the linked application', error?.code ?? error);
    }
  }
} catch (error) {
  console.warn('Could not load student dashboard records', error?.code ?? error);
  setDashboardNote('Some student records could not be loaded. Check your connection and refresh.');
}

const savedProfile = studentRecord?.profile ?? {};
const registrationApplicant = application?.applicant ?? {};
const registrationGuardian = application?.contactPerson ?? application?.guardian ?? {};
const registrationField = (source, key, fallback) => (typeof source[key] === 'string' && source[key].trim() ? source[key] : fallback);
const profile = {
  ...savedProfile,
  firstName: registrationField(registrationApplicant, 'firstName', savedProfile.firstName),
  middleName: registrationField(registrationApplicant, 'middleName', savedProfile.middleName),
  surname: registrationField(registrationApplicant, 'surname', savedProfile.surname),
  dateOfBirth: registrationField(registrationApplicant, 'dateOfBirth', savedProfile.dateOfBirth),
  gender: registrationField(registrationApplicant, 'gender', savedProfile.gender),
  phoneNumber: registrationField(registrationApplicant, 'phoneNumber', savedProfile.phoneNumber),
  nationality: registrationField(registrationApplicant, 'nationality', savedProfile.nationality),
  applicationReference: application?.reference ?? savedProfile.applicationReference,
  guardian: {
    ...(savedProfile.guardian ?? {}),
    name: registrationField(registrationGuardian, 'name', savedProfile.guardian?.name),
    relationship: registrationField(registrationGuardian, 'relationship', savedProfile.guardian?.relationship),
    phoneNumber: registrationField(registrationGuardian, 'phoneNumber', savedProfile.guardian?.phoneNumber),
    emergencyContact: registrationField(registrationGuardian, 'emergencyContact', savedProfile.guardian?.emergencyContact),
  },
};
const legalStudentName = legalName(profile, studentRecord?.displayName || accountRecord.displayName || session.user.displayName || 'Student');
const preferredName = profile.preferredName || studentRecord?.displayName || session.user.displayName || legalStudentName;
if (nameEl) nameEl.textContent = preferredName.split(' ')[0] || 'Student';
if (studentNumberEl) studentNumberEl.textContent = profile.applicationReference ? `Student number ${profile.applicationReference}` : 'Student number not assigned';
if (profileStatusEl) profileStatusEl.textContent = enrollmentStatusLabel(accountRecord.status);
if (emailVerificationEl) {
  emailVerificationEl.textContent = session.user.emailVerified ? 'Email verified' : 'Email not verified';
  emailVerificationEl.dataset.kind = session.user.emailVerified ? 'success' : 'warning';
}

if (studentDetailsEl) {
  studentDetailsEl.replaceChildren(
    ...fact('Full legal name', legalStudentName),
    ...fact('Preferred name', profile.preferredName),
    ...fact('Email', session.user.email),
  );
}

const privateFacts = [
  ...fact('Date of birth', displayDate(profile.dateOfBirth)),
  ...fact('Phone', profile.phoneNumber),
  ...fact('Nationality', profile.nationality === 'kenyan' ? 'Kenyan' : profile.nationality),
  ...fact('Gender', profile.gender),
  ...fact('Residential address', profile.residentialAddress || 'Not on file'),
  ...fact('Country of residence', profile.country || 'Not on file'),
  ...fact('Guardian name', profile.guardian?.name),
  ...fact('Relationship', profile.guardian?.relationship),
  ...fact('Guardian phone', profile.guardian?.phoneNumber),
  ...fact('Emergency contact name', profile.guardian?.emergencyContact),
];
if (privateStudentDetailsEl) privateStudentDetailsEl.replaceChildren(...privateFacts);
if (sensitiveDetailsEl) sensitiveDetailsEl.hidden = privateFacts.length === 0;

function setAvatar(url) {
  let validUrl = '';
  if (typeof url === 'string' && url.trim()) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (['https:', 'http:'].includes(parsed.protocol)) validUrl = parsed.href;
    } catch { /* an invalid or missing photo uses initials */ }
  }
  const initials = legalStudentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  if (avatarInitialsEl) avatarInitialsEl.textContent = initials || '?';
  if (removeAvatarButtonEl) removeAvatarButtonEl.hidden = !validUrl;
  if (!avatarEl) return;
  avatarEl.hidden = !validUrl;
  if (avatarInitialsEl) avatarInitialsEl.hidden = Boolean(validUrl);
  if (validUrl) avatarEl.src = validUrl;
}

setAvatar(profile.photoURL);

function accountNote(text, kind = 'info') {
  if (!accountSettingsNoteEl) return;
  accountSettingsNoteEl.textContent = text;
  accountSettingsNoteEl.dataset.kind = kind;
}

avatarUploadEl?.addEventListener('change', async () => {
  const file = avatarUploadEl.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size >= 2 * 1024 * 1024) {
    accountNote('Choose a PNG, JPEG, or WebP image smaller than 2 MB.', 'error');
    avatarUploadEl.value = '';
    return;
  }
  if (!studentRecord) {
    accountNote('Your student profile is unavailable, so the photo could not be saved.', 'error');
    return;
  }
  accountNote('Uploading profile photo…');
  try {
    const destination = storageRef(storageService(), `users/${session.user.uid}/avatar/profile`);
    const uploaded = await uploadBytes(destination, file, { contentType: file.type });
    const photoURL = await getDownloadURL(uploaded.ref);
    const nextProfile = { ...studentRecord.profile, photoURL };
    await updateDoc(doc(dbService(), 'students', session.user.uid), { profile: nextProfile, updatedAt: serverTimestamp() });
    studentRecord = { ...studentRecord, profile: nextProfile };
    setAvatar(photoURL);
    accountNote('Profile photo updated.', 'success');
  } catch (error) {
    console.warn('Could not upload profile photo', error?.code ?? error);
    accountNote('Profile photo could not be saved. Check your connection and try again.', 'error');
  } finally {
    avatarUploadEl.value = '';
  }
});

removeAvatarButtonEl?.addEventListener('click', async () => {
  if (!studentRecord || !studentRecord.profile?.photoURL) {
    accountNote('There is no profile photo to remove.', 'info');
    return;
  }
  if (!window.confirm('Remove your profile photo? Your initials will be shown instead.')) return;
  removeAvatarButtonEl.disabled = true;
  accountNote('Removing profile photo…');
  const nextProfile = { ...studentRecord.profile };
  delete nextProfile.photoURL;
  let objectDeleted = false;
  try {
    await deleteObject(storageRef(storageService(), `users/${session.user.uid}/avatar/profile`));
    objectDeleted = true;
    await updateDoc(doc(dbService(), 'students', session.user.uid), { profile: nextProfile, updatedAt: serverTimestamp() });
    studentRecord = { ...studentRecord, profile: nextProfile };
    setAvatar('');
    accountNote('Profile photo removed.', 'success');
  } catch (error) {
    console.warn('Could not remove profile photo', error?.code ?? error);
    if (objectDeleted) {
      studentRecord = { ...studentRecord, profile: nextProfile };
      setAvatar('');
      accountNote('The photo file was deleted, but its profile reference could not be saved. Refresh and contact the Centre if the old photo returns.', 'error');
    } else {
      accountNote('Profile photo could not be removed. Check your connection and try again.', 'error');
    }
  } finally {
    removeAvatarButtonEl.disabled = false;
  }
});

document.getElementById('sendVerificationEmail')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await sendEmailVerification(session.user);
    accountNote(`Verification email sent to ${session.user.email}.`, 'success');
  } catch (error) {
    console.warn('Could not send verification email', error?.code ?? error);
    accountNote('Verification email could not be sent. Try again later.', 'error');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('sendPasswordReset')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await requestPasswordReset(session.user.email);
    accountNote(`Password reset link sent to ${session.user.email}.`, 'success');
  } catch (error) {
    console.warn('Could not send password reset email', error?.code ?? error);
    accountNote('Password reset email could not be sent. Try again later.', 'error');
  } finally {
    button.disabled = false;
  }
});

const preferencesForm = document.getElementById('studentPreferencesForm');
const settingsContent = document.getElementById('studentSettingsContent');
const privacyPanel = document.getElementById('privacyDataPanel');
const privacyPanelNote = document.getElementById('privacyPanelNote');
const privacyRequestForm = document.getElementById('privacyRequestForm');
const privacyRequestTitle = document.getElementById('privacyRequestTitle');
const privacyRequestDescription = document.getElementById('privacyRequestDescription');
const privacyRequestDetails = document.getElementById('privacyRequestDetails');
const correctionCategoryGroup = document.getElementById('correctionCategoryGroup');
const correctionCategory = document.getElementById('correctionCategory');
const otherPrivacyTypeGroup = document.getElementById('otherPrivacyTypeGroup');
const otherPrivacyType = document.getElementById('otherPrivacyType');
const privacyRequestNote = document.getElementById('privacyRequestNote');
const privacyRequestHistory = document.getElementById('privacyRequestHistory');
const privacyHistoryNote = document.getElementById('privacyHistoryNote');
const privacyRequestList = document.getElementById('privacyRequestList');
const savedPreferences = studentRecord?.preferences ?? {};
const preferredLanguageEl = document.getElementById('preferredLanguage');
const emailUpdatesEl = document.getElementById('emailUpdates');
const classRemindersEl = document.getElementById('classReminders');
const reduceMotionEl = document.getElementById('reduceMotion');
if (preferredLanguageEl) preferredLanguageEl.value = savedPreferences.preferredLanguage === 'sw' ? 'sw' : 'en';
if (emailUpdatesEl) emailUpdatesEl.checked = savedPreferences.emailUpdates === true;
// Class reminders are on unless the student has switched them off.
if (classRemindersEl) classRemindersEl.checked = savedPreferences.classReminders !== false;
if (reduceMotionEl) reduceMotionEl.checked = savedPreferences.reduceMotion === true;
// Keep this browser in step with the saved choice, so every page follows it.
if (studentRecord) setReduceMotionPreference(savedPreferences.reduceMotion === true);

preferencesForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!studentRecord) {
    accountNote('Your preferences could not be saved because your profile is unavailable.', 'error');
    return;
  }
  const button = preferencesForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const preferences = {
    ...studentRecord.preferences,
    preferredLanguage: preferredLanguageEl.value,
    emailUpdates: emailUpdatesEl.checked,
    classReminders: classRemindersEl.checked,
    reduceMotion: reduceMotionEl.checked,
  };
  try {
    await updateDoc(doc(dbService(), 'students', session.user.uid), { preferences, updatedAt: serverTimestamp() });
    studentRecord = { ...studentRecord, preferences };
    setReduceMotionPreference(preferences.reduceMotion);
    accountNote('Preferences saved. Reduced motion now applies on every page, and class reminders follow your choice. Email updates and language are saved for when they become available.', 'success');
  } catch (error) {
    console.warn('Could not save student preferences', error?.code ?? error);
    accountNote('Preferences could not be saved. Check your connection and try again.', 'error');
  } finally {
    button.disabled = false;
  }
});

const PRIVACY_REQUEST_LABELS = {
  data_access: 'Request my data', correction: 'Request a correction', deletion: 'Request deletion',
  objection: 'Object to data processing', restriction: 'Restrict data processing',
};
const PRIVACY_STATUS_LABELS = {
  submitted: 'Submitted', under_review: 'Under review', needs_student: 'Action needed', completed: 'Completed', declined: 'Closed',
};
const CORRECTION_LABELS = {
  legal_identity: 'Legal name or date of birth', contact_residence: 'Contact or residence details', education: 'Education details', other: 'Other student record',
};
let activePrivacyType = '';

function privacyNote(text, kind = 'info') {
  if (!privacyPanelNote) return;
  privacyPanelNote.textContent = text;
  privacyPanelNote.hidden = !text;
  privacyPanelNote.dataset.kind = kind;
}

function startPrivacyRequest(type) {
  activePrivacyType = type;
  privacyRequestForm.reset();
  privacyRequestNote.hidden = true;
  privacyPanelNote.hidden = true;
  privacyRequestForm.hidden = false;
  privacyRequestHistory.hidden = true;
  correctionCategoryGroup.hidden = type !== 'correction';
  otherPrivacyTypeGroup.hidden = type !== 'other';
  correctionCategory.required = type === 'correction';
  privacyRequestDetails.required = type !== 'data_access';
  privacyRequestTitle.textContent = type === 'other' ? 'Other privacy request' : PRIVACY_REQUEST_LABELS[type];
  privacyRequestDescription.textContent = type === 'data_access'
    ? 'Ask CFL for a copy of the personal information held about you. You can add details about the records you need.'
    : type === 'correction'
      ? 'Describe what is inaccurate and what the correct information should be. Official changes may need staff verification.'
      : 'Deletion, objection, and restriction requests are reviewed by CFL. Explain which information or processing your request concerns.';
  privacyRequestDetails.placeholder = type === 'correction'
    ? 'Tell us what is inaccurate and what it should say. Do not include passwords or verification codes.'
    : 'Describe the records or processing this request concerns. Do not include passwords or verification codes.';
  privacyRequestDetails.focus();
}

function requestDate(value) {
  return displayDate(value) || 'Date not available';
}

function privacyRequestCard(request) {
  const typeLabel = PRIVACY_REQUEST_LABELS[request.requestType] ?? request.requestType ?? 'Privacy request';
  const statusLabel = PRIVACY_STATUS_LABELS[request.status] ?? 'Status unavailable';
  const updates = Array.isArray(request.updates) ? request.updates : [];
  return h('article', { class: 'privacy-request-item' },
    h('div', { class: 'privacy-request-item-header' },
      h('div', {},
        h('h4', {}, typeLabel),
        h('span', { class: 'privacy-request-date' }, `Request ${request.id.slice(0, 8).toUpperCase()} · ${requestDate(request.createdAt)}`)),
      h('span', { class: 'privacy-request-status', 'data-status': request.status }, statusLabel)),
    request.correctionCategory ? h('p', { class: 'privacy-request-detail' }, `${CORRECTION_LABELS[request.correctionCategory] ?? 'Record'}: ${request.details}`) :
      (request.details ? h('p', { class: 'privacy-request-detail' }, request.details) : ''),
    request.response ? h('p', { class: 'privacy-request-response' }, h('strong', {}, 'CFL response: '), request.response) :
      h('p', { class: 'privacy-request-response muted' }, 'CFL has not responded yet.'),
    request.status === 'needs_student' && request.nextAction
      ? h('p', { class: 'privacy-request-next' }, h('strong', {}, 'Your next action: '), request.nextAction) : '',
    updates.length ? h('ul', { class: 'privacy-request-timeline', 'aria-label': 'Request updates' }, ...updates.map((update) => h('li', {},
      `${PRIVACY_STATUS_LABELS[update.status] ?? update.status} · ${requestDate(update.reviewedAt)}${update.response ? `: ${update.response}` : ''}${update.nextAction ? ` Next: ${update.nextAction}` : ''}`))) : '',
  );
}

async function loadPrivacyHistory() {
  privacyRequestHistory.hidden = false;
  privacyHistoryNote.textContent = 'Loading your requests…';
  privacyRequestList.replaceChildren();
  try {
    const requests = await listMyPrivacyRequests(session.user.uid);
    privacyRequestList.replaceChildren(...(requests.length
      ? requests.map(privacyRequestCard)
      : [h('p', { class: 'privacy-request-empty' }, 'You have not submitted any privacy requests yet.')]));
    privacyHistoryNote.textContent = requests.length ? `${requests.length} ${requests.length === 1 ? 'request' : 'requests'} · newest first` : '';
  } catch (error) {
    console.warn('Could not load privacy request history', error?.code ?? error);
    privacyHistoryNote.textContent = 'Your requests could not be loaded. Check your connection and try again.';
    privacyRequestList.replaceChildren();
  }
}

document.getElementById('openPrivacyData')?.addEventListener('click', () => {
  settingsContent.hidden = true;
  privacyPanel.hidden = false;
  privacyPanel.querySelector('#privacyDataTitle')?.focus();
});
document.getElementById('backToSettings')?.addEventListener('click', () => {
  privacyPanel.hidden = true;
  settingsContent.hidden = false;
  document.getElementById('openPrivacyData')?.focus();
});
privacyPanel?.querySelectorAll('[data-privacy-request]')?.forEach((button) => {
  button.addEventListener('click', () => startPrivacyRequest(button.dataset.privacyRequest));
});
document.getElementById('showPrivacyRequests')?.addEventListener('click', () => {
  privacyRequestForm.hidden = true;
  privacyPanelNote.hidden = true;
  loadPrivacyHistory();
});
document.getElementById('refreshPrivacyRequests')?.addEventListener('click', loadPrivacyHistory);
document.getElementById('cancelPrivacyRequest')?.addEventListener('click', () => {
  privacyRequestForm.hidden = true;
  privacyRequestNote.hidden = true;
  privacyPanelNote.hidden = true;
});
privacyRequestForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  privacyRequestNote.hidden = true;
  const details = privacyRequestDetails.value.trim();
  if (activePrivacyType !== 'data_access' && details.length < 12) {
    privacyRequestNote.textContent = 'Add a few details so the Centre can review your request.';
    privacyRequestNote.hidden = false;
    privacyRequestDetails.focus();
    return;
  }
  const requestType = activePrivacyType === 'other' ? otherPrivacyType.value : activePrivacyType;
  const submitButton = privacyRequestForm.querySelector('button[type="submit"]');
  setBusy(submitButton, true, 'Submitting…');
  try {
    const result = await submitPrivacyRequest({
      requestType,
      correctionCategory: activePrivacyType === 'correction' ? correctionCategory.value : '',
      details,
    });
    privacyRequestForm.hidden = true;
    privacyNote(`Request ${result.requestId.slice(0, 8).toUpperCase()} submitted for CFL review. No data changes are made automatically.`, 'success');
    await loadPrivacyHistory();
  } catch (error) {
    console.warn('Could not submit privacy request', error?.code ?? error);
    privacyRequestNote.textContent = error.message || 'Your request could not be submitted. Check your connection and try again.';
    privacyRequestNote.hidden = false;
  } finally {
    setBusy(submitButton, false);
  }
});

if (profileCompletionEl && studentRecord) {
  const missing = missingRequiredProfileFields(profile);
  profileCompletionEl.hidden = missing.length === 0;
  if (profileCompletionTextEl && missing.length) profileCompletionTextEl.textContent = `Missing: ${missing.join(', ')}.`;
}

if (application) {
  applicationCardEl.hidden = false;
  applicationStatusEl.textContent = formatStatus(application.status, 'Status unavailable');
  applicationReferenceEl.textContent = application.reference ? `Application reference ${application.reference}` : '';
}

let programmes = fallbackProgrammes;
try { programmes = await listPublicProgrammes(); } catch (error) { console.warn('Could not load programme names', error?.code ?? error); }
const programmeById = new Map(programmes.map((programme) => [programme.id, programme]));
const orderedEnrolments = [...enrolments].sort((left, right) => {
  const priority = (status) => (status === 'active' ? 0 : status === 'pending_start' ? 1 : 2);
  return priority(left.status) - priority(right.status);
});

function renderEnrolment(enrolment) {
  if (!enrolment) {
    enrolmentDetailsEl.classList.add('is-empty');
    enrolmentDetailsEl.replaceChildren(
      h('p', { class: 'muted student-enrolment-empty-copy' }, 'No programme enrollment is linked to this account yet.'),
      h('a', { class: 'student-compact-action student-enrolment-action', href: ROUTES.programmes }, 'View programmes'),
    );
    return;
  }
  enrolmentDetailsEl.classList.remove('is-empty');
  const programme = programmeById.get(enrolment.programmeId);
  enrolmentDetailsEl.replaceChildren(
    h('div', { class: 'student-enrolment-header' },
      h('p', { class: 'student-programme-name' }, programme?.name ?? enrolment.programmeId ?? 'Programme'),
      h('span', { class: `status-pill student-enrolment-status status-${enrolment.status ?? 'unknown'}` }, enrollmentStatusLabel(enrolment.status))),
    h('dl', { class: 'student-enrolment-facts' },
      h('div', { class: 'student-enrolment-fact' }, h('dt', {}, 'Level'), h('dd', {}, PROGRAMME_GROUP_LABELS[programme?.group] ?? 'Not specified')),
      h('div', { class: 'student-enrolment-fact' }, h('dt', {}, 'Student number'), h('dd', {}, profile.applicationReference || 'Not assigned')),
      h('div', { class: 'student-enrolment-fact' }, h('dt', {}, 'Enrollment recorded'), h('dd', {}, displayDate(enrolment.createdAt) || 'Not available'))),
  );
}

if (enrolmentPickerWrapEl && enrolmentPickerEl) {
  enrolmentPickerWrapEl.hidden = orderedEnrolments.length < 2;
  enrolmentPickerEl.replaceChildren(...orderedEnrolments.map((enrolment, index) => {
    const programme = programmeById.get(enrolment.programmeId);
    const label = programme?.name ?? enrolment.programmeId ?? 'Programme';
    return el('option', { value: index }, `${label} · ${enrollmentStatusLabel(enrolment.status)}`);
  }));
  enrolmentPickerEl.addEventListener('change', () => renderEnrolment(orderedEnrolments[Number(enrolmentPickerEl.value)]));
}
renderEnrolment(orderedEnrolments[0] ?? null);
if (enrolmentHistoryNoteEl && orderedEnrolments.length > 1) {
  enrolmentHistoryNoteEl.hidden = false;
  enrolmentHistoryNoteEl.textContent = `${orderedEnrolments.length} enrollment records are linked to this account. Use the programme selector to switch between them.`;
}

const verificationButton = document.getElementById('sendVerificationEmail');
if (verificationButton) verificationButton.hidden = session.user.emailVerified;
if (avatarUploadEl) avatarUploadEl.disabled = !studentRecord;

const studentStage = document.getElementById('studentStage');
if (studentStage) {
  const hasActive = enrolments.some((entry) => entry.status === 'active' || entry.status === 'pending_start');
  const allComplete = enrolments.length > 0 && enrolments.every((entry) => entry.status === 'completed');
  const studying = enrolments.some((entry) => entry.status === 'active');
  studentStage.textContent = allComplete ? 'Graduate / Alumni' : studying ? 'Active student' : hasActive || application?.status === 'approved' ? 'Admitted' : 'Student';
}

try {
  const { classes } = await loadMyClasses(session.user.uid);
  const { upcoming } = splitClasses(classes.filter((scheduleClass) => !scheduleClass.cancelled));
  const next = nextClass(upcoming);
  if (!next) {
    nextClassContentEl.replaceChildren(h('p', { class: 'muted' }, enrolments.length ? 'No upcoming class is scheduled yet.' : 'A timetable will appear when you are enrolled in a programme.'), h('a', { class: 'link-btn', href: ROUTES.schedule }, 'Open schedule'));
  } else {
    nextClassContentEl.replaceChildren(
      h('p', { class: 'eyebrow' }, next.startsAtMs <= Date.now() ? 'Happening now' : 'Next class'),
      h('h3', {}, next.title),
      h('p', {}, `${formatDay(next.startsAtMs)} · ${describeWhen(next)}`),
      h('p', { class: 'muted' }, [programmeById.get(next.programmeId)?.name, modeLabel(next.mode), next.location, next.instructorName && `With ${next.instructorName}`].filter(Boolean).join(' · ')),
      h('div', { class: 'actions' },
        h('a', { class: 'btn', href: ROUTES.schedule }, 'View schedule'),
        next.joinLink ? h('a', { class: 'btn btn-primary', href: next.joinLink, target: '_blank', rel: 'noopener noreferrer' }, 'Join online') : ''),
    );
  }
} catch (error) {
  console.warn('Could not load the upcoming class', error?.code ?? error);
  nextClassContentEl.replaceChildren(h('p', { class: 'muted' }, 'Your timetable could not be loaded.'), h('a', { class: 'link-btn', href: ROUTES.schedule }, 'Open schedule'));
}

// Continue Learning is powered by real lesson progress.
{
  const { entries } = await loadOverview(session.user.uid);
    const learningSummaryEl = document.getElementById('learningSummary');
    const completedLessons = entries.reduce((total, entry) => total + entry.done, 0);
    const availableLessons = entries.reduce((total, entry) => total + entry.lessons.length, 0);
    if (learningSummaryEl) learningSummaryEl.replaceChildren(
      h('strong', { class: 'student-learning-count' }, `${completedLessons} of ${availableLessons}`),
      h('span', {}, 'practice lessons completed'),
      h('a', { class: 'student-dashboard-action', href: ROUTES.practice }, 'View learning progress'),
    );
  const pick = pickContinue(entries);
  const titleEl = document.getElementById('continueTitle');
  const textEl = document.getElementById('continueText');
  const actionEl = document.getElementById('continueAction');
  if (titleEl) titleEl.textContent = pick ? pick.next.title : 'All available lessons are complete';
  if (textEl) textEl.textContent = pick ? `${pick.skill.label}: You have completed ${pick.done} of ${pick.lessons.length} lessons. ${pick.next.summary}` : 'You can review any lesson in English Practice.';
  if (actionEl) {
    actionEl.replaceChildren(h('a', { class: 'btn btn-primary', href: pick ? lessonUrl(pick.skill.id, pick.next.id) : ROUTES.practice }, pick ? (pick.done ? 'Continue' : 'Start lesson') : 'Open English Practice'));
  }
}
