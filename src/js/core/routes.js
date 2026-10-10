// The single source of truth for URLs. Never hard-code a path in a page script.
import { ROLES } from '@/utils/roles.js';

export const ROUTES = Object.freeze({
  home: '/',
  programmes: '/programmes',
  gallery: '/gallery',
  login: '/login',
  register: '/register',
  activate: '/activate',
  student: '/student/dashboard',
  practice: '/student/practice',
  practiceLesson: '/student/practice/lesson',
  practiceMistakes: '/student/practice/mistakes',
  practiceFlashcards: '/student/practice/flashcards',
  instructor: '/instructor/dashboard',
  instructorReview: '/instructor/review',
  instructorReviewSubmission: '/instructor/review/submission',
  admin: '/admin/dashboard',
});

const ROLE_HOME = Object.freeze({
  student: ROUTES.student,
  instructor: ROUTES.instructor,
  admin: ROUTES.admin,
});

/** Which roles may open each protected area. Everything else is public. */
const AREAS = Object.freeze([
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/instructor', roles: ['instructor', 'admin'] },
  { prefix: '/student', roles: ['student'] },
]);

export function homeFor(role) {
  return ROLES.includes(role) ? ROLE_HOME[role] : ROUTES.login;
}

/** True only for same-site absolute paths, so a crafted ?next= can never send people elsewhere. */
export function isSafeInternalPath(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    && ![...value].some((char) => char.charCodeAt(0) < 32);
}

function pathOf(value) {
  return value.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

export function canAccess(role, path) {
  const target = pathOf(path);
  const area = AREAS.find(({ prefix }) => target === prefix || target.startsWith(`${prefix}/`));
  return area ? area.roles.includes(role) : true;
}

export function loginUrl(next) {
  if (!isSafeInternalPath(next) || pathOf(next) === ROUTES.login) return ROUTES.login;
  return `${ROUTES.login}?next=${encodeURIComponent(next)}`;
}

/** Where to send someone after sign-in: their requested page if allowed, otherwise their own home. */
export function postLoginDestination(role, next) {
  if (isSafeInternalPath(next) && pathOf(next) !== ROUTES.login && canAccess(role, next)) return next;
  return homeFor(role);
}
