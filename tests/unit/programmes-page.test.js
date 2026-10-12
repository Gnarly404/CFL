// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import presets from '../../src/data/programmes.json';

describe('public programme cards', () => {
  it('renders presets and displays the saved details in the card dialog', async () => {
    document.body.innerHTML = `
      <button class="pc-chip" data-group="all"></button>
      <button class="pc-chip" data-group="beginner"></button>
      <section id="programmeGrid"></section>
      <dialog id="programmeDialog"><p id="pdCategory"></p><h2 id="pdTitle"></h2><dl id="pdFacts"></dl></dialog>`;
    vi.resetModules();
    const { initProgrammesPage } = await import('@/pages/programmes-view.js');
    const page = initProgrammesPage({ load: async () => presets });
    await page.start();

    expect(document.querySelectorAll('#programmeGrid .pc-card')).toHaveLength(presets.length);
    document.querySelector('#programmeGrid button').click();
    expect(document.getElementById('pdTitle').textContent).toBe(presets[0].name);
    expect(document.getElementById('pdFacts').textContent).toContain(presets[0].details.skills);
    expect(document.getElementById('pdFacts').textContent).toContain(presets[0].details.applicationFeeLocal);
  });
});