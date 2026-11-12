import { describe, expect, it, vi } from 'vitest';

const getDocs = vi.fn();
const collection = vi.fn((_db, path) => ({ path }));
const limit = vi.fn((count) => ({ type: 'limit', count }));
const orderBy = vi.fn((field, direction) => ({ type: 'orderBy', field, direction }));
const query = vi.fn((collectionRef, ...constraints) => ({ collection: collectionRef, constraints }));
const where = vi.fn((field, op, value) => ({ type: 'where', field, op, value }));

vi.mock('firebase/firestore', () => ({
  collection: (...args) => collection(...args),
  getCountFromServer: vi.fn(),
  getDocs: (...args) => getDocs(...args),
  limit: (...args) => limit(...args),
  orderBy: (...args) => orderBy(...args),
  query: (...args) => query(...args),
  where: (...args) => where(...args),
}));
vi.mock('@/services/firebase-db.js', () => ({ dbService: () => ({}) }));

import { rowsFromSnapshot } from '@/services/admin-service.js';
import { listApplications } from '@/services/admin-service.js';

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

describe('listApplications', () => {
  it('filters the default admissions queue to open statuses', async () => {
    getDocs.mockResolvedValue(snapshot([], false));

    await listApplications({ status: 'open' });

    expect(query).toHaveBeenLastCalledWith(
      { path: 'applications' },
      { type: 'where', field: 'status', op: 'in', value: ['submitted', 'under_review', 'info_requested', 'waitlisted'] },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      { type: 'limit', count: 100 },
    );
  });

  it('keeps individual status filters available for reviewing past decisions', async () => {
    getDocs.mockResolvedValue(snapshot([], false));

    await listApplications({ status: 'approved' });

    expect(query).toHaveBeenLastCalledWith(
      { path: 'applications' },
      { type: 'where', field: 'status', op: '==', value: 'approved' },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      { type: 'limit', count: 100 },
    );
  });
});
