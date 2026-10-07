import { describe, expect, it } from 'vitest';
import { rowsFromSnapshot } from '@/services/admin-service.js';

const snapshot = (docs, fromCache = false) => ({
  metadata: { fromCache },
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
});

describe('rowsFromSnapshot', () => {
  it('returns rows with their ids', () => {
    expect(rowsFromSnapshot(snapshot([['a', { n: 1 }], ['b', { n: 2 }]]))).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
  });
  it('treats an empty list from the local cache as "database unreachable", not as "no data"', () => {
    expect(() => rowsFromSnapshot(snapshot([], true))).toThrow(/can't reach the database/);
  });
  it('returns an empty list when the server really has no rows', () => {
    expect(rowsFromSnapshot(snapshot([], false))).toEqual([]);
  });
});
