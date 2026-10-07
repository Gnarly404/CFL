import { createHash } from 'node:crypto';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export function hashKey(value, salt = '') {
  return createHash('sha256').update(`${salt}|${value}`).digest('hex').slice(0, 40);
}

/** Fixed-window counter. Pure, so the policy can be unit-tested without Firestore. */
export function nextWindowState(state, now, { limit, windowMs }) {
  const expired = !state || now - state.windowStart >= windowMs;
  const base = expired ? { count: 0, windowStart: now } : state;
  if (base.count >= limit) {
    return { allowed: false, state: base, retryAfterMs: base.windowStart + windowMs - now };
  }
  return { allowed: true, state: { count: base.count + 1, windowStart: base.windowStart }, retryAfterMs: 0 };
}

/**
 * Firestore-backed limiter. Keys are hashed by the caller, so no raw IPs or emails are stored.
 * Add a Firestore TTL policy on rateLimits.expiresAt so old counters are removed automatically.
 */
export function createRateLimiter({ db, now = () => Date.now() }) {
  return {
    async hit(key, options) {
      const ref = db.collection('rateLimits').doc(key);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const result = nextWindowState(snap.exists ? snap.data() : null, now(), options);
        if (result.allowed) {
          tx.set(ref, { ...result.state, expiresAt: new Date(result.state.windowStart + options.windowMs * 2) });
        }
        return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
      });
    },
  };
}
