// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import presets from '../../src/data/programmes.json';
import { tick } from '../helpers.js';

const listCatalog = vi.fn();
const saveProgramme = vi.fn();
const deleteProgramme = vi.fn();
vi.mock('@/services/programme-service.js', () => ({
  listCatalog: (...args) => listCatalog(...args),
  saveProgramme: (...args) => saveProgramme(...args),
  deleteProgramme: (...args) => deleteProgramme(...args),
}));

const catalogue = presets.map((programme) => ({ ...programme, active: true }));

function page() {
  document.body.innerHTML = `
    <form id="programmeForm">
      <input id="programmeId"><input id="programmeName"><input id="programmeCategory">
      <select id="programmeGroup"><option value="intake">Intake</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
      <input id="programmeDuration"><input id="programmeSkills"><input id="programmeEligibility">
      <input id="programmeFeeLocal"><input id="programmeFeeForeign"><input id="programmeActive" type="checkbox">
      <button type="submit">Add programme</button><button id="programmeReset" type="button">Clear</button>
    </form>
    <table><tbody id="programmesBody"></tbody></table>`;
  document.getElementById('programmeForm').scrollIntoView = vi.fn();
}

async function setup() {
  vi.resetModules();
  page();
  const say = vi.fn();
  const { initProgrammes } = await import('@/admin/programmes.js');
  const manager = initProgrammes({ say });
  await manager.load();
  return { say };
}

beforeEach(() => {
  listCatalog.mockReset().mockResolvedValue(catalogue);
  saveProgramme.mockReset().mockResolvedValue({ created: false });
  deleteProgramme.mockReset().mockResolvedValue({ deleted: true });
});

describe('admin programme cards', () => {
  it('lists preset cards and fills all editable details', async () => {
    await setup();
    expect(document.querySelectorAll('#programmesBody tr')).toHaveLength(presets.length);
    expect(document.querySelector('#programmesBody tr').textContent).toContain('Published');
    document.querySelector('#programmesBody tr button').click();
    expect(document.getElementById('programmeName').value).toBe(presets[0].name);
    expect(document.getElementById('programmeSkills').value).toBe(presets[0].details.skills);
    expect(document.getElementById('programmeFeeLocal').value).toBe(presets[0].details.applicationFeeLocal);
  });

  it('saves edits to the public card details', async () => {
    await setup();
    document.querySelector('#programmesBody tr button').click();
    document.getElementById('programmeName').value = 'Updated English intake';
    document.getElementById('programmeSkills').value = 'Speaking and writing';
    document.getElementById('programmeFeeLocal').value = 'KES 750';
    document.getElementById('programmeForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(saveProgramme).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Updated English intake',
      details: expect.objectContaining({ skills: 'Speaking and writing', applicationFeeLocal: 'KES 750' }),
    }));
  });

  it('deletes a card after confirmation', async () => {
    await setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.querySelector('#programmesBody tr .actions button:last-child').click();
    await tick();
    expect(deleteProgramme).toHaveBeenCalledWith({ id: presets[0].id });
    confirm.mockRestore();
  });
});