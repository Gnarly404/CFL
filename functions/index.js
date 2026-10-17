import './global-options.js';

// Admissions
export { submitApplication } from './src/applications/submit.js';
export { getApplicationStatus } from './src/applications/status.js';
export { decideApplication, adminDeleteRejectedApplication } from './src/applications/decide.js';

// Student privacy requests
export { submitPrivacyRequest, adminReviewPrivacyRequest, adminDeletePrivacyRequest } from './src/privacy/requests.js';

// Account administration
export { adminCreateUser } from './src/admin/create-user.js';
export { adminSetUserStatus } from './src/admin/set-user-status.js';
export { adminSetUserRole } from './src/admin/set-user-role.js';
export { adminResendInvite } from './src/admin/resend-invite.js';
export { adminAssignInstructor } from './src/admin/assign-instructor.js';
export { adminAssignProgramme } from './src/admin/assign-programme.js';
export { adminSaveProgramme } from './src/admin/save-programme.js';
export { adminDeleteProgramme } from './src/admin/delete-programme.js';

// Student records and payments
export { adminListStudentRecords, adminGetStudentRecord, adminSaveStudentRecord } from './src/admin/student-records.js';
export { adminRecordPayment, adminImportPayments, adminAssignPayment, adminReversePayment } from './src/admin/payments.js';

// Instructor tools
export { instructorSavePracticeContent } from './src/instructor/save-practice-content.js';
export { instructorNotifyFeedback } from './src/instructor/notify-feedback.js';
export { scheduleClass } from './src/instructor/schedule-class.js';
export { manageScheduledClass } from './src/instructor/schedule-class.js';
export { notifyScheduleChanges } from './src/instructor/schedule-notifications.js';

// Messaging
export { sendMessage, messageContacts } from './src/messages/messages.js';

// Account lifecycle
export { activateAccount } from './src/auth/activate-account.js';
