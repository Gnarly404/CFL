// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from '../helpers.js';
import { mountInbox } from '../../src/js/messages/inbox.js';
import { normaliseMessage } from '../../src/js/messages/state.js';

const m = (id, extra = {}) => normaliseMessage(id, {
  threadId: 'stu1_ins1', studentId: 'stu1', instructorId: 'ins1', studentName: 'Amina', instructorName: 'Ms Otieno',
  senderId: 'ins1', recipientId: 'stu1', body: `Body ${id}`, createdAt: { toMillis: () => Date.now() - (10 - Number(id)) * 60000 }, readAt: null, ...extra,
}, 'stu1');

let services;
let setUrl;
const text = (id) => document.getElementById(id).textContent;
const viewer = { uid: 'stu1', role: 'student' };

async function open({ params = '' } = {}) {
  document.body.innerHTML = `<p id="inboxSummary"></p><p id="inboxNote" hidden></p>
    <div id="inbox"><ul id="inboxList"></ul><section id="inboxThread"></section></div>`;
  await mountInbox({ root: document, viewer, services, params: new URLSearchParams(params), setUrl });
  await tick();
}
const rowFor = (name) => [...document.querySelectorAll('.thread-row')].find((b) => b.textContent.includes(name));
const type = (value) => { const box = document.getElementById('inboxMessage'); box.value = value; box.dispatchEvent(new Event('input', { bubbles: true })); };

beforeEach(() => {
  setUrl = vi.fn();
  services = {
    load: vi.fn(async () => [m('1'), m('2')]),
    contacts: vi.fn(async () => [{ uid: 'ins1', name: 'Ms Otieno' }, { uid: 'ins2', name: 'Mr Kamau' }]),
    markRead: vi.fn(async () => {}),
    send: vi.fn(async () => ({ id: 'new' })),
  };
});

describe('message centre', () => {
  it('lists conversations with unread counts and contacts you have not written to', async () => {
    await open();
    expect(services.load).toHaveBeenCalledWith('stu1');
    expect(text('inboxSummary')).toBe('2 unread · 2 conversations');
    expect(rowFor('Ms Otieno').textContent).toContain('2 unread');
    expect(rowFor('Ms Otieno').textContent).toContain('Body 2');
    expect(rowFor('Mr Kamau').textContent).toContain('Start a conversation');
    expect(text('inboxThread')).toContain('Choose a conversation');
  });

  it('opens a conversation, shows messages oldest first and marks the received ones read', async () => {
    await open();
    rowFor('Ms Otieno').click(); await tick();
    expect(setUrl).toHaveBeenCalledWith('?with=ins1');
    expect(document.querySelector('label[for="inboxMessage"]').textContent).toBe('Your message');
    expect([...document.querySelectorAll('.bubble-text')].map((p) => p.textContent)).toEqual(['Body 1', 'Body 2']);
    expect(services.markRead).toHaveBeenCalledWith(['1', '2']);
    expect(text('inboxSummary')).toBe('0 unread · 2 conversations');
    expect(document.getElementById('inbox').classList.contains('inbox--open')).toBe(true);
  });

  it('opens the conversation named in the address', async () => {
    await open({ params: 'with=ins1' });
    expect(document.querySelectorAll('.bubble')).toHaveLength(2);
    expect(services.markRead).toHaveBeenCalledTimes(1);
  });

  it('shows message text as text, never as markup', async () => {
    services.load.mockResolvedValue([m('1', { body: '<img src=x onerror=alert(1)>' })]);
    await open({ params: 'with=ins1' });
    expect(document.querySelector('.bubble img')).toBeNull();
    expect(document.querySelector('.bubble-text').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('sends a message, reloads and clears the box', async () => {
    await open({ params: 'with=ins1' });
    services.load.mockResolvedValue([m('1'), m('2'), m('3', { senderId: 'stu1', recipientId: 'ins1', body: 'My reply' })]);
    type('  My reply ');
    document.getElementById('inboxSend').click(); await tick();
    expect(services.send).toHaveBeenCalledWith('ins1', 'My reply');
    expect(document.querySelectorAll('.bubble')).toHaveLength(3);
    expect(document.getElementById('inboxMessage').value).toBe('');
    expect(document.querySelector('.bubble.mine .bubble-text').textContent).toBe('My reply');
  });

  it('starts a conversation with a contact who has no messages yet', async () => {
    await open();
    rowFor('Mr Kamau').click(); await tick();
    expect(text('inboxThread')).toContain('No messages yet');
    type('Hello sir');
    document.getElementById('inboxSend').click(); await tick();
    expect(services.send).toHaveBeenCalledWith('ins2', 'Hello sir');
  });

  it('refuses an empty message and keeps the text when sending fails', async () => {
    await open({ params: 'with=ins1' });
    document.getElementById('inboxSend').click(); await tick();
    expect(services.send).not.toHaveBeenCalled();
    expect(text('inboxNote')).toContain('Write a message first');
    services.send.mockRejectedValue(Object.assign(new Error('You are sending messages too quickly.'), { code: 'resource-exhausted' }));
    type('Keep me');
    document.getElementById('inboxSend').click(); await tick();
    expect(text('inboxNote')).toContain('too quickly');
    expect(document.getElementById('inboxMessage').value).toBe('Keep me');
    expect(document.getElementById('inboxSend').disabled).toBe(false);
  });

  it('hides the box for someone you can no longer message', async () => {
    services.contacts.mockResolvedValue([]);
    await open({ params: 'with=ins1' });
    expect(document.getElementById('inboxMessage')).toBeNull();
    expect(text('inboxThread')).toContain('can no longer send messages');
  });

  it('shows class details in a read-only thread when the teacher is not an assigned contact', async () => {
    services.load.mockResolvedValue([m('1', { kind: 'class_announcement', body: 'Class scheduled: Grammar workshop\nDate: Monday' })]);
    services.contacts.mockResolvedValue([]);
    await open({ params: 'with=ins1' });
    expect(text('inboxThread')).toContain('Class announcement');
    expect(text('inboxThread')).toContain('Class scheduled: Grammar workshop');
    expect(text('inboxThread')).toContain('Class announcements are read-only');
    expect(document.getElementById('inboxMessage')).toBeNull();
  });

  it('still works with existing conversations when contacts cannot load', async () => {
    services.contacts.mockRejectedValue(new Error('x'));
    await open();
    expect(document.getElementById('inboxNote').hidden).toBe(false);
    expect(rowFor('Ms Otieno')).toBeTruthy();
  });

  it('explains an empty inbox and a load failure', async () => {
    services.load.mockResolvedValue([]); services.contacts.mockResolvedValue([]);
    await open();
    expect(text('inboxSummary')).toContain('no teacher assigned');
    services.load.mockRejectedValue(new Error('x'));
    await open();
    expect(text('inboxSummary')).toContain('could not be loaded');
    expect(document.getElementById('inboxNote').hidden).toBe(false);
  });

  it('tells a teacher with no students there is nobody to message', async () => {
    services.load.mockResolvedValue([]); services.contacts.mockResolvedValue([]);
    document.body.innerHTML = '<p id="inboxSummary"></p><p id="inboxNote" hidden></p><div id="inbox"><ul id="inboxList"></ul><section id="inboxThread"></section></div>';
    await mountInbox({ root: document, viewer: { uid: 'ins1', role: 'instructor' }, services, params: new URLSearchParams(''), setUrl });
    expect(text('inboxSummary')).toContain('no assigned students');
  });
});
