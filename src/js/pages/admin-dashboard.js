import { guardPage } from '@/auth/guards.js';
import { initAdminDashboard } from '@/admin/admin-dashboard.js';

const session = await guardPage({ roles: ['admin'] });
initAdminDashboard({ currentUid: session.user.uid });
