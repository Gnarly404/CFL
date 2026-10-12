import { guardPage } from '@/auth/guards.js';
import { initPracticeContentEditor } from '@/instructor/practice-content.js';
import { mountInstructorShell } from '@/ui/instructor-shell.js';

const session = await guardPage({ roles: ['instructor'] });
mountInstructorShell('curriculum', session.role);
initPracticeContentEditor({ root: document });