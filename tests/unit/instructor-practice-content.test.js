// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import { tick } from '../helpers.js';

const getSkillContent = vi.fn();
const loadPracticeContent = vi.fn();
const savePracticeContent = vi.fn();
vi.mock('@/practice/content.js', () => ({
  getSkillContent: (...args) => getSkillContent(...args),
  loadPracticeContent: (...args) => loadPracticeContent(...args),
}));
vi.mock('@/services/instructor-service.js', () => ({ savePracticeContent: (...args) => savePracticeContent(...args) }));

const mount = async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <section id="practice-curriculum" hidden>
      <select id="practiceSkill"><option value="grammar">Grammar</option><option value="writing">Writing</option></select>
      <ol id="practiceLessonList"></ol>
      <button id="addPracticeLesson" type="button">Add lesson</button>
      <form id="practiceContentForm"><div id="practiceLessonFields"></div>
        <button id="deletePracticeLesson" type="button">Delete lesson</button>
        <button type="submit">Save curriculum</button>
      </form>
      <p id="practiceContentNote" hidden></p>
    </section>`;
  const { initPracticeContentEditor } = await import('@/instructor/practice-content.js');
  initPracticeContentEditor();
  await tick();
};

const inputFor = (path) => [...document.querySelectorAll('[data-path]')]
  .find((input) => JSON.stringify(JSON.parse(input.dataset.path)) === JSON.stringify(path));
const setField = (path, value) => {
  const input = inputFor(path);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const save = async () => {
  document.getElementById('practiceContentForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
};

beforeEach(() => {
  getSkillContent.mockReset().mockImplementation((skillId) => (skillId === 'grammar' ? structuredClone(grammar) : { lessons: [] }));
  loadPracticeContent.mockReset().mockResolvedValue({});
  savePracticeContent.mockReset().mockImplementation(async ({ skillId, content }) => ({ skillId, lessonCount: content.lessons.length }));
});

describe('instructor practice curriculum UI', () => {
  it('edits a lesson and its nested question using fields, then saves the curriculum', async () => {
    await mount();
    expect(document.querySelectorAll('#practiceLessonList li')).toHaveLength(grammar.lessons.length);
    setField(['title'], 'Edited lesson title');
    setField(['questions', 0, 'prompt'], 'Edited question prompt');
    await save();
    expect(savePracticeContent).toHaveBeenCalledWith(expect.objectContaining({
      skillId: 'grammar',
      content: expect.objectContaining({ lessons: expect.arrayContaining([
        expect.objectContaining({ title: 'Edited lesson title', questions: expect.arrayContaining([expect.objectContaining({ prompt: 'Edited question prompt' })]) }),
      ]) }),
    }));
  });

  it('creates a lesson from the structured editor and saves it', async () => {
    await mount();
    document.getElementById('addPracticeLesson').click();
    setField(['title'], 'New grammar lesson');
    setField(['summary'], 'A new lesson summary.');
    setField(['rule', 0], 'Use a full sentence.');
    setField(['examples', 0, 'text'], 'This is an example.');
    setField(['examples', 0, 'note'], 'Example note');
    await save();
    const content = savePracticeContent.mock.calls[0][0].content;
    expect(content.lessons).toHaveLength(grammar.lessons.length + 1);
    expect(content.lessons.at(-1)).toMatchObject({ title: 'New grammar lesson', summary: 'A new lesson summary.' });
  });

  it('removes a lesson and persists the deletion', async () => {
    await mount();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.getElementById('deletePracticeLesson').click();
    expect(document.querySelectorAll('#practiceLessonList li')).toHaveLength(grammar.lessons.length - 1);
    await save();
    expect(savePracticeContent.mock.calls[0][0].content.lessons.some((lesson) => lesson.id === grammar.lessons[0].id)).toBe(false);
    vi.restoreAllMocks();
  });
});