import { describe, expect, it } from 'vitest';
import { createDraftStore, DRAFT_TTL_MS } from '@/registration/registration-storage.js';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

describe('draft store', () => {
  it('saves and restores a draft with its step', () => {
    const store = createDraftStore(memoryStorage(), () => 1000);
    store.save({ firstName: 'Wanjiku' }, 2);
    expect(store.load()).toEqual({ data: { firstName: 'Wanjiku' }, step: 2 });
  });

  it('expires drafts after seven days and removes them', () => {
    const storage = memoryStorage();
    let now = 1000;
    const store = createDraftStore(storage, () => now);
    store.save({ firstName: 'A' }, 0);
    now += DRAFT_TTL_MS - 1;
    expect(store.load()).not.toBeNull();
    now += 2;
    expect(store.load()).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('keeps the original creation time when saving again', () => {
    const storage = memoryStorage();
    let now = 5000;
    const store = createDraftStore(storage, () => now);
    store.save({ a: '1' }, 0);
    now = 9000;
    store.save({ a: '2' }, 1);
    expect(JSON.parse([...storage.map.values()][0]).createdAt).toBe(5000);
  });

  it('ignores corrupt data and unavailable storage', () => {
    const storage = memoryStorage();
    storage.setItem('cfl.registration.draft.v1', '{not json');
    expect(createDraftStore(storage).load()).toBeNull();
    storage.setItem('cfl.registration.draft.v1', JSON.stringify({ data: 'string', expiresAt: 9e15 }));
    expect(createDraftStore(storage).load()).toBeNull();
    const none = createDraftStore(null);
    expect(() => { none.save({ a: '1' }, 0); none.clear(); }).not.toThrow();
    expect(none.load()).toBeNull();
  });

  it('clear() removes the draft', () => {
    const store = createDraftStore(memoryStorage(), () => 1);
    store.save({ a: '1' }, 0);
    store.clear();
    expect(store.load()).toBeNull();
  });
});
