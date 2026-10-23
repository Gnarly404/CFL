import { onCall, HttpsError } from '../lib/secure-call.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { PROGRAMME_ID_RE } from '../lib/shared/programme-schema.js';

export async function adminDeleteProgrammeCore(deps, { actor, data }) {
  const id = typeof data?.id === 'string' ? data.id.trim() : '';
  if (!PROGRAMME_ID_RE.test(id)) throw new HttpsError('invalid-argument', 'Choose a valid programme to delete.');

  const { db, FieldValue, audit } = deps;
  const ref = db.collection('programmes').doc(id);
  const staffRef = db.collection('programmeStaff').doc(id);
  const metaRef = db.collection('catalogMeta').doc('programmes');
  const deleted = await db.runTransaction(async (tx) => {
    const [programme, metaSnapshot] = await Promise.all([tx.get(ref), tx.get(metaRef)]);
    const meta = metaSnapshot.exists ? metaSnapshot.data() : {};
    const deletedIds = Array.isArray(meta.deletedIds) ? meta.deletedIds : [];
    const inactiveIds = (Array.isArray(meta.inactiveIds) ? meta.inactiveIds : []).filter((entry) => entry !== id);
    const changed = programme.exists || !deletedIds.includes(id);
    tx.delete(ref);
    tx.delete(staffRef);
    tx.set(metaRef, {
      deletedIds: changed ? [...new Set([...deletedIds, id])] : deletedIds,
      inactiveIds,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return changed;
  });

  if (deleted) {
    await audit({
      actorId: actor.uid,
      action: 'programme.delete',
      resource: { type: 'programme', id },
    });
  }
  return { id, deleted };
}

export const adminDeleteProgramme = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminDeleteProgrammeCore(deps, { actor, data: request.data });
});