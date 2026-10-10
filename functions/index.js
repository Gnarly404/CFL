import { setGlobalOptions } from 'firebase-functions/options';
import { REGION } from './src/lib/config.js';

setGlobalOptions({ region: REGION, maxInstances: 10 });

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

// Account lifecycle
export { activateAccount } from './src/auth/activate-account.js';
