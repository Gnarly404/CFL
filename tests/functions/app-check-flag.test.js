import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (file) => readFileSync(join(root, 'functions/src', file), 'utf8');

// The public, pre-sign-in callables are the ones App Check protects. A refactor that drops the flag
// would silently turn enforcement off even after ENFORCE_APP_CHECK=true, so pin it here.
const PUBLIC_CALLABLES = [
  ['applications/submit.js', 'submitApplication'],
  ['applications/status.js', 'getApplicationStatus'],
  ['applications/email-verification.js', 'requestEmailVerification'],
  ['applications/email-verification.js', 'verifyEmailCode'],
];

describe('App Check flag on public callables', () => {
  it.each(PUBLIC_CALLABLES)('%s: %s uses ENFORCE_APP_CHECK', (file, name) => {
    const text = source(file);
    const line = text.split('\n').find((row) => row.includes(`export const ${name} = onCall(`));
    expect(line, `${name} should be an onCall export`).toBeTruthy();
    expect(line).toContain('enforceAppCheck: ENFORCE_APP_CHECK');
  });

  it('defaults to off so existing deployments keep working', () => {
    expect(source('lib/config.js')).toMatch(/defineBoolean\('ENFORCE_APP_CHECK',\s*\{\s*default: false/);
  });
});
