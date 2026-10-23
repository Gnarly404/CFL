import { onCall as firebaseOnCall, HttpsError } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { IP_HASH_SALT } from './config.js';
import { services } from './admin.js';
import { createRateLimiter, hashKey, HOUR } from './rate-limit.js';

const IP_LIMIT = { limit: 300, windowMs: HOUR };
const ACCOUNT_LIMIT = { limit: 600, windowMs: HOUR };
const ALERT_COOLDOWN = { limit: 1, windowMs: 5 * 60 * 1000 };

/** Applies App Check and shared abuse limits to every callable endpoint. */
export function onCall(options, handler) {
  const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== 'true';
  return firebaseOnCall({ ...options, enforceAppCheck }, async (request) => {
    const { db } = services();
    const limiter = createRateLimiter({ db });
    const hash = (value) => hashKey(value, IP_HASH_SALT.value());
    const rawIp = request.rawRequest?.ip ?? 'unknown';
    const functionName = request.rawRequest?.path?.split('/').filter(Boolean).pop() ?? 'unknown';
    const limits = [
      { dimension: 'ip', value: hash(rawIp), policy: IP_LIMIT },
      ...(request.auth?.uid
        ? [{ dimension: 'account', value: hash(request.auth.uid), policy: ACCOUNT_LIMIT }]
        : []),
    ];

    for (const { dimension, value, policy } of limits) {
      const result = await limiter.hit(`call:${dimension}:${value}`, policy);
      if (!result.allowed) {
        const shouldLog = await limiter.hit(`call:alert:${dimension}:${value}`, ALERT_COOLDOWN);
        if (shouldLog.allowed) {
          logger.warn('callable rate limit exceeded', {
            event: 'security.rate_limit',
            functionName,
            dimension,
            principal: value,
            retryAfterMs: result.retryAfterMs,
          });
        }
        throw new HttpsError('resource-exhausted', 'Too many requests. Please wait and try again.');
      }
    }
    return handler(request);
  });
}

export { HttpsError };
