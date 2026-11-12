import { describe, expect, it } from 'vitest';
import { trackPendingSave, waitForPendingSaves } from '@/utils/pending-saves.js';

describe('pending saves', () => {
  it('waits for writes that are still in flight', async () => {
    let finish;
    const completion = new Promise((resolve) => { finish = resolve; });
    trackPendingSave(() => completion);
    const waiting = waitForPendingSaves();
    finish();
    await expect(waiting).resolves.toEqual([]);
  });

  it('returns failures so logout can preserve a local draft and explain the issue', async () => {
    const failure = new Error('offline write failed');
    trackPendingSave(() => Promise.reject(failure));

    await expect(waitForPendingSaves()).resolves.toEqual([failure]);
  });
});
