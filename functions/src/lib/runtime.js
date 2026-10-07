import * as logger from 'firebase-functions/logger';
import { services, inEmulator } from './admin.js';
import { APP_BASE_URL, IP_HASH_SALT } from './config.js';
import { getMailer } from './mailer.js';
import { createRateLimiter, hashKey } from './rate-limit.js';
import { applicationsRepo } from './repos.js';
import { writeAudit } from './audit.js';
import { provisionAccount } from './invite.js';

/** Wires the real Firebase services for one request. Handlers receive this; tests pass fakes instead. */
export function buildRuntime() {
  const { auth, db, FieldValue, Timestamp } = services();
  const baseUrl = APP_BASE_URL.value();
  const mailer = getMailer();
  const deps = {
    auth, db, FieldValue, Timestamp, mailer, baseUrl, log: logger,
    exposeLinks: inEmulator(),
    hash: (value) => hashKey(value, IP_HASH_SALT.value()),
    limiter: createRateLimiter({ db }),
    repo: applicationsRepo({ db, FieldValue, Timestamp }),
  };
  deps.audit = (entry) => writeAudit(deps, entry);
  deps.provision = (input) => provisionAccount(deps, input);
  return deps;
}
