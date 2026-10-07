/** Append-only record of privileged actions (readable by admins only). */
export async function writeAudit({ db, FieldValue }, { actorId, action, resource, metadata = {} }) {
  await db.collection('auditLogs').add({
    actorId,
    action,
    resource,
    metadata,
    timestamp: FieldValue.serverTimestamp(),
  });
}
