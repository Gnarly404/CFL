import { describe, expect, it } from 'vitest';
import { withTimeout } from '@/utils/async.js';

describe('withTimeout', () => {
  it('passes through a result that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });
  it('rejects when the work takes too long', async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow(/Timed out/);
  });
  it('passes through the original error', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });
});
