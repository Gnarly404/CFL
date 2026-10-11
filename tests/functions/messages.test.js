import { describe, expect, it, vi } from 'vitest';
import {
  cleanBody, listContactsCore, MAX_BODY, sendMessageCore, threadIdFor,
} from '../../functions/src/messages/messages.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const student = { uid: 'stu1', role: 'student' };
const teacher = { uid: 'ins1', role: 'instructor' };

function env(overrides = {}, limiter = { hit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })) }) {
  const db = fakeDb();
  db.store.set('users/stu1', { role: 'student', displayName: 'Amina K', status: 'active' });
  db.store.set('users/ins1', { role: 'instructor', displayName: 'Ms Otieno', status: 'active' });
  db.store.set('users/ins2', { role: 'instructor', displayName: 'Mr Kamau', status: 'active' });
  db.store.set('students/stu1', { instructorIds: ['ins1'] });
  db.store.set('students/stu2', { instructorIds: ['ins2'] });
  for (const [key, value] of Object.entries(overrides)) { if (value === null) db.store.delete(key); else db.store.set(key, value); }
  return { db, FieldValue: fakeFieldValue(), limiter, log: { warn: vi.fn() } };
}
const send = (deps, data, who) => sendMessageCore(deps, { actor: who, data });
const code = async (promise) => promise.then(() => null, (e) => e.code);
const messages = (d) => [...d.db.store.entries()].filter(([k]) => k.startsWith('messages/')).map(([, v]) => v);

describe('cleanBody', () => {
  it('keeps plain text, drops control characters and collapses blank lines', () => {
    expect(cleanBody('  Hello\u0000 there\r\n\r\n\r\n\r\nBye  ')).toBe('Hello there\n\nBye');
    expect(cleanBody('<b>hi</b>')).toBe('<b>hi</b>');
    expect(cleanBody(42)).toBe('');
    expect(cleanBody('   ')).toBe('');
  });
});

describe('sendMessage', () => {
  it('a student messages their assigned teacher, and the teacher gets no notification record', async () => {
    const d = env();
    const result = await send(d, { recipientId: 'ins1', body: ' Hello teacher ' }, student);
    expect(result.threadId).toBe(threadIdFor('stu1', 'ins1'));
    expect(messages(d)).toEqual([{
      threadId: 'stu1_ins1', participants: ['stu1', 'ins1'], studentId: 'stu1', instructorId: 'ins1', studentName: 'Amina K', instructorName: 'Ms Otieno',
      senderId: 'stu1', recipientId: 'ins1', senderRole: 'student', body: 'Hello teacher', createdAt: 'SERVER_TS', readAt: null,
    }]);
    expect([...d.db.store.keys()].some((k) => k.startsWith('notifications/'))).toBe(false);
  });

  it('a teacher messages an assigned student and the student gets one refreshed notification per conversation', async () => {
    const d = env();
    await send(d, { recipientId: 'stu1', body: 'Finish Unit 3 please' }, teacher);
    expect(d.db.store.get('notifications/message_stu1_ins1')).toEqual({
      userId: 'stu1', type: 'message', category: 'teacher', title: 'New message from Ms Otieno', body: 'Finish Unit 3 please',
      link: '/student/messages?with=ins1', sourceId: 'stu1_ins1', createdAt: 'SERVER_TS', readAt: null, archivedAt: null,
    });
    d.db.store.get('notifications/message_stu1_ins1').readAt = 'READ';
    await send(d, { recipientId: 'stu1', body: 'Second note' }, teacher);
    const n = d.db.store.get('notifications/message_stu1_ins1');
    expect(n.readAt).toBeNull();
    expect(n.body).toBe('Second note');
    expect(messages(d)).toHaveLength(2);
  });

  it('shortens a long notification preview but stores the whole message', async () => {
    const d = env();
    await send(d, { recipientId: 'stu1', body: 'x'.repeat(500) }, teacher);
    expect(d.db.store.get('notifications/message_stu1_ins1').body).toHaveLength(120);
    expect(messages(d)[0].body).toHaveLength(500);
  });

  it('refuses people who are not assigned to each other', async () => {
    const d = env();
    expect(await code(send(d, { recipientId: 'ins2', body: 'hi' }, student))).toBe('permission-denied');
    expect(await code(send(d, { recipientId: 'stu2', body: 'hi' }, teacher))).toBe('permission-denied');
    expect(await code(send(d, { recipientId: 'ghost', body: 'hi' }, teacher))).toBe('permission-denied');
    expect(messages(d)).toHaveLength(0);
  });

  it('validates the recipient and the text', async () => {
    const d = env();
    expect(await code(send(d, { body: 'hi' }, student))).toBe('invalid-argument');
    expect(await code(send(d, { recipientId: '../x', body: 'hi' }, student))).toBe('invalid-argument');
    expect(await code(send(d, { recipientId: 'stu1', body: 'hi' }, student))).toBe('invalid-argument');
    expect(await code(send(d, { recipientId: 'ins1', body: '   ' }, student))).toBe('invalid-argument');
    expect(await code(send(d, { recipientId: 'ins1', body: 'x'.repeat(MAX_BODY + 1) }, student))).toBe('invalid-argument');
    expect(await code(send(d, { recipientId: 'ins1', body: 'x'.repeat(MAX_BODY) }, student))).toBeNull();
  });

  it('will not message a disabled or missing account', async () => {
    expect(await code(send(env({ 'users/ins1': { displayName: 'X', status: 'disabled' } }), { recipientId: 'ins1', body: 'hi' }, student))).toBe('failed-precondition');
    expect(await code(send(env({ 'users/stu1': null }), { recipientId: 'stu1', body: 'hi' }, teacher))).toBe('failed-precondition');
  });

  it('rate limits the sender before writing anything', async () => {
    const limiter = { hit: vi.fn(async () => ({ allowed: false, retryAfterMs: 1000 })) };
    const d = env({}, limiter);
    expect(await code(send(d, { recipientId: 'ins1', body: 'hi' }, student))).toBe('resource-exhausted');
    expect(limiter.hit).toHaveBeenCalledWith('msg:stu1', { limit: 30, windowMs: 3_600_000 });
    expect(messages(d)).toHaveLength(0);
  });

  it('still delivers the message if the notification cannot be written', async () => {
    const d = env();
    const original = d.db.collection.bind(d.db);
    d.db.collection = (col) => {
      const c = original(col);
      if (col !== 'notifications') return c;
      return { ...c, doc: () => ({ set: async () => { throw new Error('boom'); } }) };
    };
    expect(await code(send(d, { recipientId: 'stu1', body: 'hi' }, teacher))).toBeNull();
    expect(d.log.warn).toHaveBeenCalled();
    expect(messages(d)).toHaveLength(1);
  });
});

describe('message contacts', () => {
  it('a student sees assigned, active teachers with names', async () => {
    const d = env({ 'students/stu1': { instructorIds: ['ins1', 'ins2', 'gone'] }, 'users/ins2': { displayName: 'Mr Kamau', status: 'disabled' } });
    expect(await listContactsCore(d, { actor: student })).toEqual([{ uid: 'ins1', name: 'Ms Otieno' }]);
  });
  it('a teacher sees only their own students', async () => {
    const d = env();
    expect(await listContactsCore(d, { actor: teacher })).toEqual([{ uid: 'stu1', name: 'Amina K' }]);
    expect(await listContactsCore(d, { actor: { uid: 'ins9', role: 'instructor' } })).toEqual([]);
  });
  it('falls back to a generic name', async () => {
    const d = env({ 'users/ins1': { status: 'active' } });
    expect(await listContactsCore(d, { actor: student })).toEqual([{ uid: 'ins1', name: 'Your teacher' }]);
  });
});
