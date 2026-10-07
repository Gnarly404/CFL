// Account roles. The role lives in a server-set custom claim; the browser can never change it.
export const ROLES = Object.freeze(['student', 'instructor', 'admin']);

export const ROLE_LABELS = Object.freeze({
  student: 'Student',
  instructor: 'Instructor',
  admin: 'Administrator',
});

export function isRole(value) {
  return ROLES.includes(value);
}
