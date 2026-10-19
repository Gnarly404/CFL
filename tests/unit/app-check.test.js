import { describe, expect, it, vi } from 'vitest';
import { startAppCheck } from '@/services/app-check.js';

class FakeProvider {
  constructor(key) { this.key = key; }
}
const app = { name: '[DEFAULT]' };

function run(options) {
  const init = vi.fn(() => ({ token: 'ok' }));
  const scope = {};
  const result = startAppCheck(app, { init, Provider: FakeProvider, scope, ...options });
  return { init, scope, result };
}

describe('startAppCheck', () => {
  it('does nothing when no site key is configured', () => {
    for (const siteKey of [undefined, '', '   ', null]) {
      const { init, result } = run({ siteKey });
      expect(init).not.toHaveBeenCalled();
      expect(result).toBeNull();
    }
  });

  it('does nothing against the local emulators, even with a key', () => {
    const { init, scope } = run({ siteKey: 'site-key', useEmulators: true, dev: true });
    expect(init).not.toHaveBeenCalled();
    expect(scope.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('starts App Check with a reCAPTCHA Enterprise provider and auto refresh', () => {
    const { init, result } = run({ siteKey: ' site-key ' });
    expect(init).toHaveBeenCalledTimes(1);
    const [calledApp, options] = init.mock.calls[0];
    expect(calledApp).toBe(app);
    expect(options.provider).toBeInstanceOf(FakeProvider);
    expect(options.provider.key).toBe('site-key');
    expect(options.isTokenAutoRefreshEnabled).toBe(true);
    expect(result).toEqual({ token: 'ok' });
  });

  it('asks for a debug token only in a development build', () => {
    expect(run({ siteKey: 'k', dev: false }).scope.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
    expect(run({ siteKey: 'k', dev: true }).scope.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
  });
});
