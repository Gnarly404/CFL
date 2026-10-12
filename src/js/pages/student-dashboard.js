import { sendEmailVerification } from 'firebase/auth';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { guardPage } from '@/auth/guards.js';
import { dbService } from '@/services/firebase-db.js';
import { el } from '@/utils/dom.js';
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
import { mountPortalShell } from '@/ui/portal-shell.js';
import { mountNotificationBadge } from '@/ui/notification-badge.js';

mountPortalShell('dashboard');
const session = await guardPage({ roles: ['student'] });
mountNotificationBadge(session.user.uid);
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
const academicFactsEl = document.getElementById('academicFacts');
const identityDocumentStatusEl = document.getElementById('identityDocumentStatus');
const identityDocumentDetailsEl = document.getElementById('identityDocumentDetails');
const consentStatusEl = document.getElementById('consentStatus');
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
const registrationGuardian = application?.guardian ?? {};
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
const academicBackground = registrationApplicant.academicBackground ?? savedProfile.academicBackground ?? {};
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

if (academicFactsEl) {
  academicFactsEl.replaceChildren(
    ...fact('Previous qualifications', academicBackground.previousQualifications || 'Not on file'),
    ...fact('Language proficiency', academicBackground.languageProficiency || 'Not assessed'),
    ...fact('Certificates submitted', academicBackground.certificates?.length ? `${academicBackground.certificates.length} record(s)` : 'No records'),
  );
}

const identityDocument = studentRecord?.identityDocuments?.[0] ?? profile.identityDocument ?? application?.identityDocument ?? null;
if (identityDocumentStatusEl && identityDocument) {
  const rawNumber = identityDocument.nationalId ?? identityDocument.passportNumber ?? identityDocument.number ?? '';
  const suffix = String(rawNumber).replace(/\s/g, '').slice(-4);
  identityDocumentStatusEl.textContent = 'Identification record on file. Number is masked.';
  identityDocumentDetailsEl.hidden = false;
  identityDocumentDetailsEl.replaceChildren(
    ...fact('Type', identityDocument.type ?? (identityDocument.passportNumber ? 'Passport' : 'National ID')),
    ...fact('Number', suffix ? `**** ${suffix}` : 'Not provided'),
    ...fact('Verification', identityDocument.verified === true ? 'Verified' : 'Pending verification'),
    ...fact('Expiry date', displayDate(identityDocument.expiryDate) || 'Not recorded'),
  );
}
if (consentStatusEl) {
  const consent = application?.consent;
  consentStatusEl.textContent = consent?.acceptedAt
    ? `Registration consent recorded${consent.version ? ` · version ${consent.version}` : ''} · ${displayDate(consent.acceptedAt)}`
    : 'No registration consent record is linked to this account.';
}

function setAvatar(url) {
  let validUrl = '';
  try {
    const parsed = new URL(url, window.location.origin);
    if (['https:', 'http:'].includes(parsed.protocol)) validUrl = parsed.href;
  } catch { /* an invalid or missing photo uses initials */ }
  const initials = legalStudentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  if (avatarInitialsEl) avatarInitialsEl.textContent = initials || '?';
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
const savedPreferences = studentRecord?.preferences ?? {};
const preferredLanguageEl = document.getElementById('preferredLanguage');
const emailUpdatesEl = document.getElementById('emailUpdates');
const classRemindersEl = document.getElementById('classReminders');
const reduceMotionEl = document.getElementById('reduceMotion');
if (preferredLanguageEl) preferredLanguageEl.value = savedPreferences.preferredLanguage === 'sw' ? 'sw' : 'en';
if (emailUpdatesEl) emailUpdatesEl.checked = savedPreferences.emailUpdates === true;
if (classRemindersEl) classRemindersEl.checked = savedPreferences.classReminders === true;
if (reduceMotionEl) reduceMotionEl.checked = savedPreferences.reduceMotion === true;
if (savedPreferences.reduceMotion) document.documentElement.dataset.reduceMotion = 'true';

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
    if (preferences.reduceMotion) document.documentElement.dataset.reduceMotion = 'true';
    else delete document.documentElement.dataset.reduceMotion;
    accountNote('Preferences saved. Reduced motion is applied now; language and notification delivery settings are stored for future portal support.', 'success');
  } catch (error) {
    console.warn('Could not save student preferences', error?.code ?? error);
    accountNote('Preferences could not be saved. Check your connection and try again.', 'error');
  } finally {
    button.disabled = false;
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
      h('p', { class: 'muted' }, 'No programme enrollment is linked to this account yet.'),
      h('a', { class: 'student-compact-action', href: ROUTES.programmes }, 'View programmes'),
    );
    return;
  }
  enrolmentDetailsEl.classList.remove('is-empty');
  const programme = programmeById.get(enrolment.programmeId);
  enrolmentDetailsEl.replaceChildren(
    h('p', { class: 'student-programme-name' }, programme?.name ?? enrolment.programmeId ?? 'Programme'),
    h('span', { class: `status-pill status-${enrolment.status ?? 'unknown'}` }, enrollmentStatusLabel(enrolment.status)),
    h('dl', { class: 'student-facts' },
      ...fact('Level', PROGRAMME_GROUP_LABELS[programme?.group] ?? ''),
      ...fact('Student number', profile.applicationReference),
      ...fact('Enrollment recorded', displayDate(enrolment.createdAt))),
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
