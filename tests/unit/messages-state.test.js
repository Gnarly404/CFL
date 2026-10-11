import { describe, expect, it } from 'vitest';
import { MAX_BODY as SERVER_MAX } from '../../functions/src/messages/messages.js';
import {
  buildThreads, cleanDraft, inboxEntries, MAX_BODY, normaliseMessage, previewOf,
} from '../../src/js/messages/state.js';

const raw = (id, extra = {}) => ({
  threadId: 'stu1_ins1', studentId: 'stu1', instructorId: 'ins1', studentName: 'Amina', instructorName: 'Ms Otieno',
  senderId: 'ins1', recipientId: 'stu1', body: `msg ${id}`, createdAt: { toMillis: () => Number(id) * 1000 }, readAt: null, ...extra,
});
const msg = (id, extra, uid = 'stu1') => normaliseMessage(id, raw(id, extra), uid);

describe('message state', () => {
  it('uses the same length limit as the server', () => {
    expect(MAX_BODY).toBe(SERVER_MAX);
  });

  it('normalises a message', () => {
    expect(msg('5')).toMatchObject({ id: '5', createdAtMs: 5000, read: false, mine: false, body: 'msg 5' });
    expect(msg('5', { senderId: 'stu1', readAt: {} }).mine).toBe(true);
    expect(msg('5', { readAt: {} }).read).toBe(true);
    expect(normaliseMessage('x', {}, 'u')).toMatchObject({ body: '', createdAtMs: 0, threadId: '' });
  });

  it('groups conversations, orders them and counts what is unread for you', () => {
    const list = [msg('3'), msg('1'), msg('2', { senderId: 'stu1', recipientId: 'ins1' }),
      msg('9', { threadId: 'stu1_ins2', instructorId: 'ins2', instructorName: 'Mr Kamau' }), msg('4', { threadId: '' })];
    const threads = buildThreads(list, 'stu1', 'student');
    expect(threads.map((t) => t.otherName)).toEqual(['Mr Kamau', 'Ms Otieno']);
    expect(threads[1].messages.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(threads[1].unread).toBe(2);
    expect(threads[1].otherId).toBe('ins1');
  });

  it('shows the student to a teacher, with fallbacks for missing names', () => {
    const t = buildThreads([msg('1', { studentName: '', senderId: 'stu1', recipientId: 'ins1' }, 'ins1')], 'ins1', 'instructor');
    expect(t[0]).toMatchObject({ otherId: 'stu1', otherName: 'Student', unread: 1 });
    expect(buildThreads([msg('1', { instructorName: '' })], 'stu1', 'student')[0].otherName).toBe('Your teacher');
  });

  it('adds contacts you have not written to, and flags people you can no longer message', () => {
    const threads = buildThreads([msg('1'), msg('2', { threadId: 'stu1_ins2', instructorId: 'ins2', instructorName: 'Mr Kamau' })], 'stu1', 'student');
    const entries = inboxEntries(threads, [{ uid: 'ins1', name: 'Ms Otieno' }, { uid: 'ins3', name: 'Ada Z' }, { uid: 'ins4', name: 'Bea Y' }]);
    expect(entries.map((e) => [e.otherId, e.canSend])).toEqual([['ins2', false], ['ins1', true], ['ins3', true], ['ins4', true]]);
    expect(entries.find((e) => e.otherId === 'ins3')).toMatchObject({ threadId: null, messages: [], unread: 0 });
  });

  it('cleans and validates a draft', () => {
    expect(cleanDraft('  hi\u0000 there ')).toEqual({ ok: true, value: 'hi there' });
    expect(cleanDraft('   ').ok).toBe(false);
    expect(cleanDraft('x'.repeat(MAX_BODY + 1)).ok).toBe(false);
    expect(cleanDraft('x'.repeat(MAX_BODY)).ok).toBe(true);
  });

  it('shortens previews on one line', () => {
    expect(previewOf('a\n\nb   c')).toBe('a b c');
    expect(previewOf('x'.repeat(200))).toHaveLength(80);
  });
});
