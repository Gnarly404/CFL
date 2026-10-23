import { onCall, HttpsError } from '../lib/secure-call.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { validateProgramme } from '../lib/shared/programme-schema.js';

const DEFAULT_DETAILS = {
  skills: 'Grammar, Writing, Speech, Listening, Reading & Vocabulary',
  eligibility: 'High School Certificate',
  applicationFeeLocal: 'KES 1,000',
  applicationFeeForeign: 'KES 0',
};
const DETAIL_LIMITS = { skills: 240, eligibility: 160, applicationFeeLocal: 80, applicationFeeForeign: 80 };

function programmeDetails(input) {
  const details = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_DETAILS)) {
    const raw = input?.details?.[key];
    if (raw != null && typeof raw !== 'string') throw new HttpsError('invalid-argument', 'Programme details must be text.');
    const value = raw == null ? defaultValue : raw.trim();
    if (value.length > DETAIL_LIMITS[key]) throw new HttpsError('invalid-argument', 'A programme detail is too long.');
    details[key] = value;
  }
  return details;
}

/**
 * Creates or updates a programme in the catalogue. Only administrators can do this; instructors
 * teach programmes they are assigned to, they do not edit the list itself.
 */
export async function adminSaveProgrammeCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const { ok, value, errors } = validateProgramme(data);
  if (!ok) {
    const first = Object.values(errors)[0] || 'Check the programme details.';
    throw new HttpsError('invalid-argument', first, { fieldErrors: errors });
  }

  const details = programmeDetails(data);
  const ref = db.collection('programmes').doc(value.id);
  const metaRef = db.collection('catalogMeta').doc('programmes');
  const created = await db.runTransaction(async (tx) => {
    const [existing, metaSnapshot] = await Promise.all([tx.get(ref), tx.get(metaRef)]);
    const meta = metaSnapshot.exists ? metaSnapshot.data() : {};
    const deletedIds = (Array.isArray(meta.deletedIds) ? meta.deletedIds : []).filter((id) => id !== value.id);
    const inactiveIds = (Array.isArray(meta.inactiveIds) ? meta.inactiveIds : []).filter((id) => id !== value.id);
    if (!value.active) inactiveIds.push(value.id);
    const record = {
      id: value.id,
      name: value.name,
      category: value.category,
      group: value.group,
      duration: value.duration,
      details,
      active: value.active,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!existing.exists) record.createdAt = FieldValue.serverTimestamp();
    tx.set(ref, record, { merge: existing.exists });
    tx.set(metaRef, { deletedIds, inactiveIds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return !existing.exists;
  });

  await audit({
    actorId: actor.uid,
    action: created ? 'programme.create' : 'programme.update',
    resource: { type: 'programme', id: value.id },
    metadata: { name: value.name, active: value.active },
  });
  return { programme: { ...value, details }, created };
}

export const adminSaveProgramme = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminSaveProgrammeCore(deps, { actor, data: request.data });
});
