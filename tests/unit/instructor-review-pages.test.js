// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import writing from '../../src/data/practice/writing.json';
import { loadPage, tick } from '../helpers.js';

const listAssignedStudents = vi.fn();
const loadSubmittedWork = vi.fn();
const loadMyFeedback = vi.fn();
const saveFeedback = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'ins1', email: 'i@x.com' } }) }));
vi.mock('@/services/review-service.js', () => ({
  listAssignedStudents: (...a) => listAssignedStudents(...a),
  loadSubmittedWork: (...a) => loadSubmittedWork(...a),
  loadMyFeedback: (...a) => loadMyFeedback(...a),
  saveFeedback: (...a) => saveFeedback(...a),
}));
vi.mock('@/services/instructor-service.js', () => ({ getInstructorDashboardData: vi.fn().mockResolvedValue({ displayName: 'Ms Otieno', bio: '' }) }));

const task = writing.lessons[0].writing;
const students = [{ uid: 'stu1', displayName: 'Amina K', email: 'a@x.com' }, { uid: 'stu2', displayName: 'Brian O', email: 'b@x.com' }];
const sub = (studentId, ms, content = 'I like my town. It is big.') => ({ id: `${studentId}_${task.promptId}`, studentId, promptId: task.promptId, skill: 'writing', content, submittedAtMs: ms });
const text = (id) => document.getElementById(id).textContent;

async function open(path, script, search = '') {
  vi.resetModules();
  loadPage(path);
  window.history.replaceState({}, '', `/${search}`);
  await import(script);
  await tick();
}

beforeEach(() => {
  listAssignedStudents.mockReset().mockResolvedValue(students);
  loadMyFeedback.mockReset().mockResolvedValue({});
  loadSubmittedWork.mockReset().mockImplementation(async (id) => (id === 'stu1' ? [sub('stu1', 2000)] : [sub('stu2', 1000)]));
  saveFeedback.mockReset().mockResolvedValue();
});

describe('instructor review queue', () => {
  it('lists submitted work oldest first and separates what already has feedback', async () => {
    loadMyFeedback.mockResolvedValue({ [`stu2_${task.promptId}`]: { overall: 'Done' } });
    await open('instructor/review/index.html', '@/pages/instructor-review.js');
    expect(text('queueSummary')).toBe('1 waiting · 1 with feedback');
    const headings = [...document.querySelectorAll('#queue h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Waiting for feedback', 'Feedback given']);
    expect(text('queue')).toContain('Amina K');
    expect(text('queue')).toContain(task.topic);
    const links = [...document.querySelectorAll('#queue a')].map((a) => a.getAttribute('href'));
    expect(links[0]).toBe(`/instructor/review/submission?student=stu1&id=stu1_${task.promptId}`);
  });

  it('says so when nothing was submitted, and when a student cannot be read', async () => {
    loadSubmittedWork.mockImplementation(async (id) => { if (id === 'stu2') throw new Error('denied'); return []; });
    await open('instructor/review/index.html', '@/pages/instructor-review.js');
    expect(text('queueSummary')).toBe('No submitted writing yet.');
    expect(document.getElementById('queueNote').hidden).toBe(false);
    expect(text('queueNote')).toContain('1 student');
  });

  it('shows a clear message when the queue cannot load', async () => {
    listAssignedStudents.mockRejectedValue(new Error('offline'));
    await open('instructor/review/index.html', '@/pages/instructor-review.js');
    expect(text('queueSummary')).toContain('could not be loaded');
  });
});

describe('instructor dashboard', () => {
  it('shows the waiting count and assigned students', async () => {
    await open('instructor/dashboard.html', '@/pages/instructor-dashboard.js');
    expect(text('instructorName')).toBe('Ms Otieno');
    expect(text('awaitTitle')).toBe('2 pieces of writing waiting for feedback');
    expect(text('assignedStudents')).toContain('Brian O');
  });
});

describe('feedback page', () => {
  const url = `?student=stu1&id=stu1_${task.promptId}`;
  const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const click = (sel) => document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

  it('shows the writing untouched and no way to edit it', async () => {
    await open('instructor/review/submission.html', '@/pages/instructor-review-submission.js', url);
    expect(document.querySelector('.submitted-text').textContent).toBe('I like my town. It is big.');
    expect(document.querySelector('.submitted-text textarea, .submitted-text input')).toBeNull();
    expect(text('stage')).toContain('cannot be changed here');
  });

  it('refuses a quote that is not in the writing and saves valid feedback once', async () => {
    await open('instructor/review/submission.html', '@/pages/instructor-review-submission.js', url);
    type(document.getElementById('overall'), 'Clear start.');
    click('#addNote'); await tick();
    type(document.getElementById('quote-0'), 'It was big');
    type(document.getElementById('note-0'), 'Tense.');
    click('#saveFeedback'); await tick();
    expect(text('stage')).toContain('not in the student');
    expect(saveFeedback).not.toHaveBeenCalled();
    type(document.getElementById('quote-0'), 'It is big');
    document.getElementById('quote-0').dispatchEvent(new Event('change', { bubbles: true })); await tick();
    expect(document.querySelector('.submitted-text mark').textContent).toBe('It is big1');
    click('#saveFeedback'); await tick();
    expect(saveFeedback).toHaveBeenCalledTimes(1);
    const [uid, submission, value, existing] = saveFeedback.mock.calls[0];
    expect(uid).toBe('ins1');
    expect(submission.id).toBe(`stu1_${task.promptId}`);
    expect(value).toEqual({ overall: 'Clear start.', notes: [{ quote: 'It is big', note: 'Tense.' }] });
    expect(existing).toBeNull();
    expect(text('stage')).toContain('Feedback saved');
    expect(document.getElementById('saveFeedback').textContent).toBe('Update feedback');
  });

  it('loads earlier feedback for editing and updates rather than creating', async () => {
    loadMyFeedback.mockResolvedValue({ [`stu1_${task.promptId}`]: { overall: 'Before', notes: [] } });
    await open('instructor/review/submission.html', '@/pages/instructor-review-submission.js', url);
    expect(document.getElementById('overall').value).toBe('Before');
    type(document.getElementById('overall'), 'After');
    click('#saveFeedback'); await tick();
    expect(saveFeedback.mock.calls[0][3]).toMatchObject({ overall: 'Before' });
  });

  it('keeps the teacher’s words and says so when saving fails', async () => {
    saveFeedback.mockRejectedValue(new Error('offline'));
    await open('instructor/review/submission.html', '@/pages/instructor-review-submission.js', url);
    type(document.getElementById('overall'), 'Keep me');
    click('#saveFeedback'); await tick();
    expect(text('stage')).toContain('could not be saved');
    expect(document.getElementById('overall').value).toBe('Keep me');
  });

  it('does not open writing from a student who is not assigned', async () => {
    await open('instructor/review/submission.html', '@/pages/instructor-review-submission.js', `?student=stuX&id=stuX_${task.promptId}`);
    expect(text('stage')).toContain('Writing not found');
  });
});
