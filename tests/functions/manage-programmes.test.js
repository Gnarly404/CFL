import { describe, expect, it, vi } from 'vitest';
import fallback from '../../src/data/programmes.json';
import { adminDeleteProgrammeCore } from '../../functions/src/admin/delete-programme.js';
import { adminSaveProgrammeCore } from '../../functions/src/admin/save-programme.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const actor = { uid: 'admin1', role: 'admin' };
const env = () => ({ db: fakeDb(), FieldValue: fakeFieldValue(), audit: vi.fn() });
const programme = { ...fallback[0], active: true };

describe('programme card management', () => {
  it('saves programme details and clears previous catalogue tombstones', async () => {
    const deps = env();
    deps.db.store.set('catalogMeta/programmes', { deletedIds: [programme.id], inactiveIds: [programme.id] });
    const result = await adminSaveProgrammeCore(deps, { actor, data: programme });
    expect(result.created).toBe(true);
    expect(deps.db.store.get(`programmes/${programme.id}`)).toMatchObject({ details: programme.details, active: true });
    expect(deps.db.store.get('catalogMeta/programmes')).toMatchObject({ deletedIds: [], inactiveIds: [] });
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'programme.create' }));
  });

  it('deletes the saved card and its instructor assignments while retaining a tombstone', async () => {
    const deps = env();
    deps.db.store.set(`programmes/${programme.id}`, programme);
    deps.db.store.set(`programmeStaff/${programme.id}`, { instructorIds: ['teacher1'] });
    const result = await adminDeleteProgrammeCore(deps, { actor, data: { id: programme.id } });
    expect(result).toEqual({ id: programme.id, deleted: true });
    expect(deps.db.store.has(`programmes/${programme.id}`)).toBe(false);
    expect(deps.db.store.has(`programmeStaff/${programme.id}`)).toBe(false);
    expect(deps.db.store.get('catalogMeta/programmes').deletedIds).toContain(programme.id);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'programme.delete' }));
  });

  it('rejects malformed programme ids', async () => {
    await expect(adminDeleteProgrammeCore(env(), { actor, data: { id: '../bad' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});