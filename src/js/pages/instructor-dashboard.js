import { guardPage } from '@/auth/guards.js';

const session = await guardPage({ roles: ['instructor', 'admin'] });
const name = document.getElementById('instructorName');
if (name) name.textContent = session.user.displayName || session.user.email;
