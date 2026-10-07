import { doc, getDoc } from 'firebase/firestore';
import { guardPage } from '@/auth/guards.js';
import { dbService } from '@/services/firebase-db.js';

const MESSAGES = {
  Monday: 'Wishing you a productive start to the week!',
  Tuesday: 'Keep pushing forward and stay motivated!',
  Wednesday: "You're halfway through the week. Stay strong!",
  Thursday: 'Almost there! Keep up the great work!',
  Friday: 'Congratulations on making it through the week!',
  Saturday: 'Enjoy your weekend and take some time to relax!',
  Sunday: 'Rest, recharge, and prepare for a new week!',
};

const session = await guardPage({ roles: ['student'] });

const day = new Date().toLocaleDateString('en-KE', { weekday: 'long' });
const dayMessage = document.getElementById('dayMessage');
if (dayMessage) dayMessage.textContent = `Have a wonderful ${day}! ${MESSAGES[day] ?? ''}`.trim();

// Real account data. Courses, schedule and fees below are still sample content until the portal session.
const nameEl = document.getElementById('studentName');
const regEl = document.getElementById('registrationNumber');
const chipEl = document.getElementById('profileName');
const shownName = session.user.displayName || session.user.email;
if (nameEl) nameEl.textContent = shownName;
if (chipEl) chipEl.textContent = shownName;
try {
  const snap = await getDoc(doc(dbService(), 'students', session.user.uid));
  const profile = snap.exists() ? snap.data() : {};
  if (profile.displayName) {
    if (nameEl) nameEl.textContent = profile.displayName;
    if (chipEl) chipEl.textContent = profile.displayName;
  }
  if (regEl) regEl.textContent = profile.profile?.applicationReference ?? '—';
} catch (error) {
  if (regEl) regEl.textContent = '—';
  console.warn('Could not load the student profile', error?.code ?? error);
}
