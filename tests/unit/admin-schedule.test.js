// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from '../helpers.js';

const listClasses = vi.fn();
const createClass = vi.fn();
const manageScheduledClass = vi.fn();
vi.mock('@/services/schedule-service.js', () => ({
  listClasses: (...a) => listClasses(...a),
  createClass: (...a) => createClass(...a),
  manageScheduledClass: (...a) => manageScheduledClass(...a),
}));

const row = (extra = {}) => ({ id: 'c1', programmeId: 'english-intake', title: 'Speaking', startsAtMs: Date.now() + 86_400_000, endsAtMs: Date.now() + 90_000_000, mode: 'online', instructorName: 'Ms Otieno', cancelled: false, ...extra });

async function setup(list = []) {
  document.body.innerHTML = `<form id="classForm"><select id="classProgramme"></select><input id="classTitle">
    <input id="classDate"><input id="classStart"><input id="classEnd"><select id="classMode"><option value="in_person">a</option><option value="online">b</option></select>
    <input id="classLocation"><input id="classLink"><textarea id="classNotes"></textarea><button type="submit">Add</button></form><table><tbody id="classesBody"></tbody></table>`;
  listClasses.mockResolvedValue(list);
  const say = vi.fn();
  const { initSchedule } = await import('@/schedule/manager.js');
  const ui = initSchedule({ say, instructor: { uid: 'ins1', displayName: 'Ms Otieno' } });
  await ui.load();
  return say;
}
const set = (id, value) => { document.getElementById(id).value = value; };
const submit = async () => { document.getElementById('classForm').dispatchEvent(new Event('submit', { cancelable: true })); await tick(); };

beforeEach(() => { listClasses.mockReset(); createClass.mockReset().mockResolvedValue({ classId: 'new' }); manageScheduledClass.mockReset().mockResolvedValue(); });

describe('instructor class schedule', () => {
  it('loads only the current instructor’s classes and shows an empty state', async () => {
    await setup();
    expect(listClasses).toHaveBeenCalledWith({ instructorId: 'ins1' });
    expect(document.getElementById('classesBody').textContent).toContain('No classes scheduled yet');
  });

  it('refuses an invalid class and says why', async () => {
    const say = await setup();
    await submit();
    expect(createClass).not.toHaveBeenCalled();
    expect(say.mock.calls[0][0]).toContain('Choose a programme.');
    expect(say.mock.calls[0][1]).toBe('error');
  });

  it('creates a valid class with the instructor named', async () => {
    const say = await setup();
    set('classProgramme', 'english-intake'); set('classTitle', 'Speaking'); set('classDate', '2026-10-12');
    set('classStart', '10:00'); set('classEnd', '11:00');
    await submit();
    expect(createClass).toHaveBeenCalledTimes(1);
    const [value] = createClass.mock.calls[0];
    expect(value.startsAt).toBeInstanceOf(Date);
    expect(value).toMatchObject({ programmeId: 'english-intake', title: 'Speaking', instructorId: 'ins1', instructorName: 'Ms Otieno', mode: 'in_person' });
    expect(say).toHaveBeenCalledWith('Class scheduled. Enrolled students are being notified.', 'success');
  });

  it('keeps the form and reports when saving fails', async () => {
    createClass.mockRejectedValue(new Error('denied'));
    const say = await setup();
    set('classProgramme', 'english-intake'); set('classTitle', 'Speaking'); set('classDate', '2026-10-12'); set('classStart', '10:00'); set('classEnd', '11:00');
    await submit();
    expect(say).toHaveBeenCalledWith('denied', 'error');
    expect(document.getElementById('classTitle').value).toBe('Speaking');
  });

  it('cancels, restores, and permanently deletes with confirmation', async () => {
    await setup([row()]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const button = (name) => document.querySelector(`#classesBody button[aria-label^="${name}"]`);
    expect(button('Delete')).toBeTruthy();
    button('Cancel').click(); await tick();
    expect(manageScheduledClass).not.toHaveBeenCalled();
    listClasses.mockResolvedValue([row({ cancelled: true })]);
    button('Cancel').click(); await tick();
    expect(manageScheduledClass).toHaveBeenCalledWith('c1', 'cancel');
    button('Restore').click(); await tick();
    expect(manageScheduledClass).toHaveBeenLastCalledWith('c1', 'restore');
    button('Delete').click(); await tick();
    expect(manageScheduledClass).toHaveBeenLastCalledWith('c1', 'delete');
  });

  it('shows the server time-conflict alert and keeps the form values', async () => {
    createClass.mockRejectedValue(new Error('This class overlaps with another class on your schedule.'));
    const say = await setup();
    set('classProgramme', 'english-intake'); set('classTitle', 'Speaking'); set('classDate', '2026-10-12');
    set('classStart', '10:00'); set('classEnd', '11:00');
    await submit();
    expect(say).toHaveBeenCalledWith('This class overlaps with another class on your schedule.', 'error');
    expect(document.getElementById('classTitle').value).toBe('Speaking');
  });
});
