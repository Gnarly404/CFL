import './global-options.js';

// Admissions
export { submitApplication } from './src/applications/submit.js';
export { getApplicationStatus } from './src/applications/status.js';
export { decideApplication } from './src/applications/decide.js';

// Account administration
export { adminCreateUser } from './src/admin/create-user.js';
export { adminSetUserStatus } from './src/admin/set-user-status.js';
export { adminSetUserRole } from './src/admin/set-user-role.js';
export { adminResendInvite } from './src/admin/resend-invite.js';
export { adminAssignInstructor } from './src/admin/assign-instructor.js';

// Instructor tools
export { instructorNotifyFeedback } from './src/instructor/notify-feedback.js';

// Account lifecycle
export { activateAccount } from './src/auth/activate-account.js';
