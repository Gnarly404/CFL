import { OPEN_STATUSES } from './shared/application-status.js';

export function formatReference(year, n) {
  return `CFL-${year}-${String(n).padStart(5, '0')}`;
}

/** Firestore-backed application storage. Handlers depend on this small interface, not on Firestore. */
export function applicationsRepo({ db, FieldValue, Timestamp }) {
  const col = () => db.collection('applications');
  const toRecord = (snap) => ({ id: snap.id, ...snap.data() });

  return {
    async findOpenByEmail(email) {
      const snap = await col().where('email', '==', email).where('status', 'in', OPEN_STATUSES).limit(1).get();
      return snap.empty ? null : toRecord(snap.docs[0]);
    },

    async findByReference(reference) {
      const snap = await col().where('reference', '==', reference).limit(1).get();
      return snap.empty ? null : toRecord(snap.docs[0]);
    },

    async getById(id) {
      const snap = await col().doc(id).get();
      return snap.exists ? toRecord(snap) : null;
    },

    /** Allocates the next reference (CFL-YYYY-00001) and stores the application atomically. */
    async create(fields, year) {
      const counterRef = db.collection('counters').doc(`applications-${year}`);
      const appRef = col().doc();
      let reference = '';
      await db.runTransaction(async (tx) => {
        const counter = await tx.get(counterRef);
        const next = (counter.exists ? counter.data().value : 0) + 1;
        reference = formatReference(year, next);
        tx.set(counterRef, { value: next });
        tx.set(appRef, {
          ...fields,
          reference,
          status: 'submitted',
          userId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          statusHistory: [{ status: 'submitted', at: Timestamp.now(), by: 'applicant' }],
        });
      });
      return { id: appRef.id, reference };
    },

    async applyDecision(id, { status, note, by, userId }) {
      const ref = col().doc(id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const history = snap.data()?.statusHistory ?? [];
        tx.update(ref, {
          status,
          updatedAt: FieldValue.serverTimestamp(),
          decidedBy: by,
          ...(userId ? { userId } : {}),
          statusHistory: [...history, { status, at: Timestamp.now(), by, ...(note ? { note } : {}) }].slice(-30),
        });
      });
    },
  };
}
