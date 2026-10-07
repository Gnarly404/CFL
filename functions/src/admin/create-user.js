import { onCall, HttpsError } from 'firebase-functions/https';
import { SMTP_PASS } from '../lib/config.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { ROLES } from '../lib/shared/roles.js';
import { cleanText, normaliseEmail, validateEmail, validateName } from '../lib/shared/validation.js';

/** Admin creates an account server-side. The admin's own session is never touched. */
export async function adminCreateUserCore(deps, { actor, data }) {
  const email = normaliseEmail(data?.email);
  const emailError = validateEmail(email);
  if (emailError) throw new HttpsError('invalid-argument', emailError);
  const nameError = validateName(data?.displayName, { label: 'Name' });
  if (nameError) throw new HttpsError('invalid-argument', nameError);
  if (!ROLES.includes(data?.role)) throw new HttpsError('invalid-argument', 'Choose a role.');

  const result = await deps.provision({
    email, displayName: cleanText(data.displayName), role: data.role, createdBy: actor.uid,
  });
  await deps.audit({
    actorId: actor.uid,
    action: 'user.create',
    resource: { type: 'user', id: result.uid },
    metadata: { role: data.role, email },
  });
  return {
    uid: result.uid,
    invited: result.invited,
    // Only in the local emulator, where email is logged rather than sent.
    ...(deps.exposeLinks && result.activationUrl ? { activationUrl: result.activationUrl } : {}),
  };
}

export const adminCreateUser = onCall({ cors: true, secrets: [SMTP_PASS] }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminCreateUserCore(deps, { actor, data: request.data });
});
