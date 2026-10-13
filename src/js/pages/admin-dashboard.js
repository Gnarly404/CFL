import { guardPage } from '@/auth/guards.js';
import { initAdminDashboard } from '@/admin/admin-dashboard.js';
import { initConsole } from '@/admin/console.js';
import { initTableLabels } from '@/ui/table-labels.js';

const session = await guardPage({ roles: ['admin'] });
initConsole();
initTableLabels();
initAdminDashboard({ currentUid: session.user.uid });
