// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from '../helpers.js';

const listStudents = vi.fn();
const assignInstructor = vi.fn();
vi.mock('@/services/admin-service.js', () => ({
  listStudents: (...a) => listStudents(...a),
  assignInstructor: (...a) => assignInstructor(...a),
}));

const users = [
  { uid: 'stu1', displayName: 'Amina K', email: 'a@x.com', role: 'student', status: 'active' },
  { uid: 'ins1', displayName: 'Ms Otieno', email: 'o@x.com', role: 'instructor', status: 'active' },
  { uid: 'ins2', displayName: 'Mr Kamau', email: 'k@x.com', role: 'instructor', status: 'disabled' },
];

async function setup(students) {
  document.body.innerHTML = '<table><tbody id="assignmentsBody"></tbody></table>';
  listStudents.mockResolvedValue(students);
  const say = vi.fn();
  const { initAssignments } = await import('@/admin/assignments.js');
  const ui = initAssignments({ say, getUsers: () => users });
  await ui.load();
  return say;
}

beforeEach(() => { listStudents.mockReset(); assignInstructor.mockReset().mockResolvedValue({}); });

describe('teaching assignments', () => {
  it('offers only active instructors and assigns the chosen one', async () => {
    const say = await setup([{ uid: 'stu1', instructorIds: [] }]);
    const select = document.querySelector('select');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Choose an instructor…', 'Ms Otieno']);
    select.value = 'ins1';
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Assign').click();
    await tick();
    expect(assignInstructor).toHaveBeenCalledWith({ studentId: 'stu1', instructorId: 'ins1', assigned: true });
    expect(say).toHaveBeenCalledWith('Assigned Ms Otieno.', 'success');
  });

  it('does nothing when no instructor is chosen', async () => {
    await setup([{ uid: 'stu1', instructorIds: [] }]);
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Assign').click();
    expect(assignInstructor).not.toHaveBeenCalled();
  });

  it('asks before removing, then removes', async () => {
    const say = await setup([{ uid: 'stu1', instructorIds: ['ins1'] }]);
    const remove = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Remove');
    window.confirm = vi.fn().mockReturnValue(false);
    remove.click();
    expect(assignInstructor).not.toHaveBeenCalled();
    window.confirm = vi.fn().mockReturnValue(true);
    remove.click();
    await tick();
    expect(assignInstructor).toHaveBeenCalledWith({ studentId: 'stu1', instructorId: 'ins1', assigned: false });
    expect(say).toHaveBeenCalledWith('Removed Ms Otieno.', 'success');
  });

  it('shows empty and error states', async () => {
    await setup([]);
    expect(document.getElementById('assignmentsBody').textContent).toContain('No students yet.');
    listStudents.mockRejectedValue(new Error('offline'));
    const { initAssignments } = await import('@/admin/assignments.js');
    const say = vi.fn();
    await initAssignments({ say, getUsers: () => users }).load();
    expect(document.getElementById('assignmentsBody').textContent).toContain('could not be loaded');
    expect(say).toHaveBeenCalledWith('offline', 'error');
  });

  it('reports a failed assignment without losing the page', async () => {
    assignInstructor.mockRejectedValue(new Error('A student can have at most 5 instructors.'));
    const say = await setup([{ uid: 'stu1', instructorIds: [] }]);
    document.querySelector('select').value = 'ins1';
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Assign').click();
    await tick();
    expect(say).toHaveBeenCalledWith('A student can have at most 5 instructors.', 'error');
  });
});
