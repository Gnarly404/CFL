import { describe, expect, it, vi } from 'vitest';
import { adminAssignProgrammeCore, MAX_INSTRUCTORS_PER_PROGRAMME } from '../../functions/src/admin/assign-programme.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const actor = { uid: 'admin1', role: 'admin' };
function env({ instructorStatus = 'active', ids } = {}) {
  const db = fakeDb();
  db.store.set('users/ins1', { role: 'instructor', status: instructorStatus });
  db.store.set('users/ins2', { role: 'instructor', status: 'active' });
  db.store.set('users/stu9', { role: 'student', status: 'active' });
  if (ids) db.store.set('programmeStaff/english', { instructorIds: ids });
  return { db, FieldValue: fakeFieldValue(), audit: vi.fn() };
}
const call = (deps, data) => adminAssignProgrammeCore(deps, { actor, data });

describe('adminAssignProgramme', () => {
  it('creates the programme record on first assignment and audits it', async () => {
    const d = env();
    expect(await call(d, { programmeId: 'english', instructorId: 'ins1', assigned: true })).toEqual({ programmeId: 'english', instructorIds: ['ins1'] });
    expect(d.db.store.get('programmeStaff/english').instructorIds).toEqual(['ins1']);
    expect(d.audit).toHaveBeenCalledWith({ actorId: 'admin1', action: 'programme.assign_instructor', resource: { type: 'programme', id: 'english' }, metadata: { instructorId: 'ins1' } });
  });

  it('allows several instructors on one programme, and repeating changes nothing', async () => {
    const d = env({ ids: ['ins1'] });
    expect((await call(d, { programmeId: 'english', instructorId: 'ins2', assigned: true })).instructorIds).toEqual(['ins1', 'ins2']);
    await call(d, { programmeId: 'english', instructorId: 'ins2', assigned: true });
    expect(d.audit).toHaveBeenCalledTimes(1);
  });

  it('allows one instructor on several programmes', async () => {
    const d = env();
    await call(d, { programmeId: 'english', instructorId: 'ins1', assigned: true });
    await call(d, { programmeId: 'french', instructorId: 'ins1', assigned: true });
    expect(d.db.store.get('programmeStaff/french').instructorIds).toEqual(['ins1']);
    expect(d.db.store.get('programmeStaff/english').instructorIds).toEqual(['ins1']);
  });

  it('removes only the chosen instructor, and removing a stranger changes nothing', async () => {
    const d = env({ ids: ['ins1', 'ins2'] });
    expect((await call(d, { programmeId: 'english', instructorId: 'ins1', assigned: false })).instructorIds).toEqual(['ins2']);
    expect(d.audit.mock.calls[0][0].action).toBe('programme.unassign_instructor');
    await call(d, { programmeId: 'english', instructorId: 'ins1', assigned: false });
    expect(d.audit).toHaveBeenCalledTimes(1);
  });

  it('only real, active instructors can be assigned', async () => {
    await expect(call(env(), { programmeId: 'english', instructorId: 'stu9', assigned: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call(env(), { programmeId: 'english', instructorId: 'nobody', assigned: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call(env({ instructorStatus: 'disabled' }), { programmeId: 'english', instructorId: 'ins1', assigned: true })).rejects.toThrow(/disabled/);
  });

  it('rejects malformed input', async () => {
    await expect(call(env(), { programmeId: '../x', instructorId: 'ins1', assigned: true })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(env(), { programmeId: 'english', instructorId: '', assigned: true })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(env(), { programmeId: 'english', instructorId: 'ins1' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('caps the team size', async () => {
    const ids = Array.from({ length: MAX_INSTRUCTORS_PER_PROGRAMME }, (_, i) => `x${i}`);
    await expect(call(env({ ids }), { programmeId: 'english', instructorId: 'ins1', assigned: true })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
