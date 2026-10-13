// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import { tick } from '../helpers.js';

const getSkillContent = vi.fn();
vi.mock('@/practice/content.js', () => ({
  getSkillContent: (...args) => getSkillContent(...args),
  loadPracticeContent: () => Promise.resolve({}),
}));
vi.mock('@/services/instructor-service.js', () => ({ savePracticeContent: vi.fn() }));

const mount = async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <section id="practice-curriculum" hidden>
      <div id="practiceSkillTabs" role="tablist"></div>
      <div class="curriculum-skill-picker"><select id="practiceSkill"><option value="grammar">Grammar</option><option value="writing">Writing</option></select></div>
      <div id="practiceStudioPanel" role="tabpanel">
        <ol id="practiceLessonList"></ol><button id="addPracticeLesson" type="button">Add lesson</button>
        <form id="practiceContentForm"><div id="practiceLessonFields"></div>
          <button id="deletePracticeLesson" type="button">Delete lesson</button><button type="submit">Save</button>
          <p id="practiceContentNote" hidden></p></form>
      </div>
    </section>`;
  const { initPracticeContentEditor } = await import('@/instructor/practice-content.js');
  initPracticeContentEditor();
  await tick();
};
// A lesson shows all of its questions at once, so these look only at the first question's options.
const firstQuestion = () => document.querySelector('.curriculum-options');
const optionInputs = () => [...firstQuestion().querySelectorAll('.curriculum-option input[type="text"]')];
const radios = () => [...firstQuestion().querySelectorAll('.curriculum-option input[type="radio"]')];
const removeButtons = () => [...firstQuestion().querySelectorAll('.curriculum-option .btn')];

beforeEach(() => {
  getSkillContent.mockImplementation((skill) => (skill === 'grammar' ? structuredClone(grammar) : { lessons: [] }));
});

describe('curriculum editor: skill tabs', () => {
  it('builds an accessible tab per skill from the select, with lesson counts, and the select stays in sync', async () => {
    await mount();
    const tabs = [...document.querySelectorAll('#practiceSkillTabs [role="tab"]')];
    expect(tabs.map((tab) => tab.dataset.skill)).toEqual(['grammar', 'writing']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].querySelector('.studio-count').textContent).toBe(String(grammar.lessons.length));
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    expect(document.querySelector('.curriculum-skill-picker').hidden).toBe(true);

    tabs[1].click();
    await tick();
    expect(document.getElementById('practiceSkill').value).toBe('writing');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('practiceStudioPanel').getAttribute('aria-labelledby')).toBe(tabs[1].id);
  });

  it('moves between tabs with the arrow keys', async () => {
    await mount();
    const strip = document.getElementById('practiceSkillTabs');
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await tick();
    expect(document.getElementById('practiceSkill').value).toBe('writing');
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    await tick();
    expect(document.getElementById('practiceSkill').value).toBe('grammar');
  });

  it('flags a skill with unsaved changes on its tab', async () => {
    await mount();
    const title = document.querySelector('[data-path=\'["title"]\']');
    title.value = 'Changed';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const tab = document.querySelector('#practiceSkillTabs [data-skill="grammar"]');
    expect(tab.hasAttribute('data-dirty')).toBe(true);
    expect(tab.querySelector('.studio-unsaved').textContent).toMatch(/unsaved/);
    expect(document.getElementById('practiceContentForm').dataset.dirty).toBe('true');
  });
});

describe('curriculum editor: questions', () => {
  it('shows each option with a radio for the correct one, selected from the question\'s answer index', async () => {
    await mount();
    const first = grammar.lessons[0].questions[0];
    expect(optionInputs().map((input) => input.value)).toEqual(first.options);
    expect(radios().findIndex((radio) => radio.checked)).toBe(first.answer);
    // the old "correct option number" field is replaced by the radios
    expect(document.querySelector('[data-path=\'["questions",0,"answer"]\']')).toBeNull();
    // the prompt is still addressable by path, as before
    expect(document.querySelector('[data-path=\'["questions",0,"prompt"]\']').value).toBe(first.prompt);
  });

  it('choosing a radio changes the answer, and removing an option keeps the answer pointing at the same text', async () => {
    await mount();
    const form = document.getElementById('practiceContentForm');
    radios()[2].checked = true;
    radios()[2].dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('practiceContentForm').dataset.dirty).toBe('true');

    const correctText = optionInputs()[2].value;
    removeButtons()[0].click(); // remove option 1
    expect(optionInputs()).toHaveLength(2);
    expect(optionInputs()[radios().findIndex((radio) => radio.checked)].value).toBe(correctText);
    expect(form.dataset.dirty).toBe('true');
  });

  it('refuses to leave a question with fewer than two options', async () => {
    await mount();
    removeButtons()[0].click();
    expect(optionInputs()).toHaveLength(2);
    removeButtons()[0].click();
    expect(optionInputs()).toHaveLength(2);
    expect(document.getElementById('practiceContentNote').textContent).toMatch(/at least 2 options/);
  });

  it('adds an option', async () => {
    await mount();
    const before = optionInputs().length;
    firstQuestion().querySelector(':scope > .btn').click();
    expect(optionInputs()).toHaveLength(before + 1);
  });
});
