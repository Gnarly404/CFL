import { describe, expect, it, vi } from 'vitest';
import { adminAssignInstructorCore, MAX_INSTRUCTORS_PER_STUDENT } from '../../functions/src/admin/assign-instructor.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const actor = { uid: 'admin1', role: 'admin' };
function env({ instructorStatus = 'active', ids = [] } = {}) {
  const db = fakeDb();
  db.store.set('users/ins1', { role: 'instructor', status: instructorStatus });
  db.store.set('users/ins2', { role: 'instructor', status: 'active' });
  db.store.set('users/stu9', { role: 'student', status: 'active' });
  db.store.set('students/stu1', { instructorIds: ids });
  return { db, FieldValue: fakeFieldValue(), audit: vi.fn() };
}
const call = (deps, data) => adminAssignInstructorCore(deps, { actor, data });

describe('adminAssignInstructor', () => {
  it('assigns an instructor, audits it, and is safe to repeat', async () => {
    const d = env();
    expect(await call(d, { studentId: 'stu1', instructorId: 'ins1', assigned: true })).toEqual({ studentId: 'stu1', instructorIds: ['ins1'] });
    expect(d.db.store.get('students/stu1').instructorIds).toEqual(['ins1']);
    expect(d.audit).toHaveBeenCalledWith({ actorId: 'admin1', action: 'student.assign_instructor', resource: { type: 'student', id: 'stu1' }, metadata: { instructorId: 'ins1' } });
    await call(d, { studentId: 'stu1', instructorId: 'ins1', assigned: true });
    expect(d.db.store.get('students/stu1').instructorIds).toEqual(['ins1']);
  });

  it('removes only the chosen instructor', async () => {
    const d = env({ ids: ['ins1', 'ins2'] });
    expect((await call(d, { studentId: 'stu1', instructorId: 'ins1', assigned: false })).instructorIds).toEqual(['ins2']);
    expect(d.audit.mock.calls[0][0].action).toBe('student.unassign_instructor');
  });

  it('removing someone who was never assigned changes nothing', async () => {
    const d = env({ ids: ['ins2'] });
    expect((await call(d, { studentId: 'stu1', instructorId: 'ins1', assigned: false })).instructorIds).toEqual(['ins2']);
  });

  it('only real, active instructors can be assigned', async () => {
    await expect(call(env(), { studentId: 'stu1', instructorId: 'stu9', assigned: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call(env(), { studentId: 'stu1', instructorId: 'nobody', assigned: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call(env({ instructorStatus: 'disabled' }), { studentId: 'stu1', instructorId: 'ins1', assigned: true })).rejects.toThrow(/disabled/);
  });

  it('a disabled instructor can still be removed', async () => {
    const d = env({ instructorStatus: 'disabled', ids: ['ins1'] });
    expect((await call(d, { studentId: 'stu1', instructorId: 'ins1', assigned: false })).instructorIds).toEqual([]);
  });

  it('rejects a missing student and bad input without writing or auditing', async () => {
    const d = env();
    await expect(call(d, { studentId: 'ghost', instructorId: 'ins1', assigned: true })).rejects.toMatchObject({ code: 'not-found' });
    await expect(call(d, { studentId: 'stu1', instructorId: 'ins1' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(d, { studentId: 5, instructorId: 'ins1', assigned: true })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(d.audit).not.toHaveBeenCalled();
  });

  it('caps instructors per student', async () => {
    const d = env({ ids: Array.from({ length: MAX_INSTRUCTORS_PER_STUDENT }, (_, i) => `x${i}`) });
    await expect(call(d, { studentId: 'stu1', instructorId: 'ins1', assigned: true })).rejects.toThrow(/at most/);
  });
});
