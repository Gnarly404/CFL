// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import programmes from '../../src/data/programmes.json';
import { tick } from '../helpers.js';

const listProgrammeStaff = vi.fn();
const assignProgramme = vi.fn();
vi.mock('@/services/admin-service.js', () => ({
  listProgrammeStaff: (...a) => listProgrammeStaff(...a),
  assignProgramme: (...a) => assignProgramme(...a),
}));

const users = [
  { uid: 'ins1', displayName: 'Ms Otieno', email: 'o@x.com', role: 'instructor', status: 'active' },
  { uid: 'ins2', displayName: 'Mr Kamau', email: 'k@x.com', role: 'instructor', status: 'active' },
  { uid: 'ins3', displayName: 'Disabled One', email: 'd@x.com', role: 'instructor', status: 'disabled' },
  { uid: 'stu1', displayName: 'Amina K', email: 'a@x.com', role: 'student', status: 'active' },
];
const first = programmes[0];

async function setup(staff) {
  document.body.innerHTML = '<table><tbody id="programmeStaffBody"></tbody></table>';
  listProgrammeStaff.mockResolvedValue(staff);
  const say = vi.fn();
  const { initProgrammeStaff } = await import('@/admin/programme-staff.js');
  await initProgrammeStaff({ say, getUsers: () => users }).load();
  return say;
}
const firstRow = () => document.querySelector('#programmeStaffBody tr');

beforeEach(() => { listProgrammeStaff.mockReset(); assignProgramme.mockReset().mockResolvedValue({}); });

describe('programme staff', () => {
  it('lists every programme, with none assigned yet', async () => {
    await setup(new Map());
    expect(document.querySelectorAll('#programmeStaffBody tr')).toHaveLength(programmes.length);
    expect(firstRow().textContent).toContain('No instructor yet');
  });

  it('offers only active instructors, never students or disabled accounts', async () => {
    await setup(new Map());
    const names = [...firstRow().querySelectorAll('option')].map((o) => o.textContent);
    expect(names).toContain('Ms Otieno');
    expect(names).toContain('Mr Kamau');
    expect(names).not.toContain('Disabled One');
    expect(names).not.toContain('Amina K');
  });

  it('assigns the chosen instructor to that programme', async () => {
    const say = await setup(new Map());
    const select = firstRow().querySelector('select');
    select.value = 'ins1';
    firstRow().querySelector('button').click();
    await tick();
    expect(assignProgramme).toHaveBeenCalledWith({ programmeId: first.id, instructorId: 'ins1', assigned: true });
    expect(say).toHaveBeenCalledWith(expect.stringContaining('Assigned Ms Otieno'), 'success');
  });

  it('shows several instructors on one programme and lets one be removed after confirmation', async () => {
    await setup(new Map([[first.id, ['ins1', 'ins2']]]));
    expect(firstRow().textContent).toContain('Ms Otieno');
    expect(firstRow().textContent).toContain('Mr Kamau');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const remove = firstRow().querySelector('ul button');
    remove.click(); await tick();
    expect(assignProgramme).not.toHaveBeenCalled();
    remove.click(); await tick();
    expect(assignProgramme).toHaveBeenCalledWith({ programmeId: first.id, instructorId: 'ins1', assigned: false });
    confirm.mockRestore();
  });

  it('reports a failed change in plain words', async () => {
    assignProgramme.mockRejectedValue(new Error('That person is not an instructor.'));
    const say = await setup(new Map());
    firstRow().querySelector('select').value = 'ins1';
    firstRow().querySelector('button').click();
    await tick();
    expect(say).toHaveBeenCalledWith('That person is not an instructor.', 'error');
  });

  it('says so when the list cannot be loaded', async () => {
    listProgrammeStaff.mockRejectedValue(new Error('offline'));
    document.body.innerHTML = '<table><tbody id="programmeStaffBody"></tbody></table>';
    const say = vi.fn();
    const { initProgrammeStaff } = await import('@/admin/programme-staff.js');
    await initProgrammeStaff({ say, getUsers: () => users }).load();
    expect(document.getElementById('programmeStaffBody').textContent).toContain('could not be loaded');
    expect(say).toHaveBeenCalledWith('offline', 'error');
  });
});
