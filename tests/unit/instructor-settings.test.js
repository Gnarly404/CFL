// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initInstructorSettings } from '@/instructor/settings.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const markup = `<dialog id="instructorSettingsDialog"><form id="instructorSettingsForm">
  <div id="instructorBioGroup"><textarea id="instructorBioInput"></textarea><span id="instructorBioCount"></span></div>
  <select id="instructorVoice"><option value="female"></option><option value="male"></option></select><button id="instructorVoiceSample" type="button"></button>
  <input id="instructorReduceMotion" type="checkbox"><button type="submit">Save</button>
  <button id="instructorPasswordReset" type="button"></button><p id="instructorSettingsNote" hidden></p></form></dialog>
  <button id="openInstructorSettings"></button>`;

describe('instructor settings', () => {
  beforeEach(() => {
    document.body.innerHTML = markup;
    delete document.documentElement.dataset.reduceMotion;
    window.localStorage.clear();
    HTMLDialogElement.prototype.showModal ||= function showModal() { this.setAttribute('open', ''); };
  });

  it('saves the bio and reduce-motion choice, and applies reduced motion now', async () => {
    const saveProfile = vi.fn(async () => {});
    const onBio = vi.fn();
    initInstructorSettings({ profile: { bio: 'Old', preferences: {} }, email: 'i@x.co', saveProfile, sendReset: vi.fn(), onBio });
    expect(document.getElementById('instructorBioInput').value).toBe('Old');
    document.getElementById('instructorBioInput').value = '  Teaches   French  ';
    document.getElementById('instructorReduceMotion').checked = true;
    document.getElementById('instructorSettingsForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(saveProfile).toHaveBeenCalledWith({ bio: 'Teaches French', preferences: { reduceMotion: true, voice: 'female' } });
    expect(onBio).toHaveBeenCalledWith('Teaches French');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('applies the saved choice on load, and rejects an over-long bio without saving', async () => {
    const saveProfile = vi.fn();
    initInstructorSettings({ profile: { bio: '', preferences: { reduceMotion: true } }, email: 'i@x.co', saveProfile, sendReset: vi.fn() });
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    document.getElementById('instructorBioInput').value = 'x'.repeat(501);
    document.getElementById('instructorSettingsForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(saveProfile).not.toHaveBeenCalled();
    expect(document.getElementById('instructorSettingsNote').dataset.kind).toBe('error');
  });

  it('without a profile (an admin) hides the bio and keeps the choice in this browser only', async () => {
    const saveProfile = vi.fn();
    initInstructorSettings({ profile: null, email: 'a@x.co', saveProfile, sendReset: vi.fn() });
    expect(document.getElementById('instructorBioGroup').hidden).toBe(true);
    document.getElementById('instructorReduceMotion').checked = true;
    document.getElementById('instructorSettingsForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(saveProfile).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('cfl.reduceMotion')).toBe('true');
  });

  it('saves the chosen voice, shows the saved one, and remembers it in the browser', async () => {
    const saveProfile = vi.fn(async () => {});
    initInstructorSettings({ profile: { bio: '', preferences: { voice: 'male' } }, email: 'i@x.co', saveProfile, sendReset: vi.fn() });
    expect(document.getElementById('instructorVoice').value).toBe('male');
    expect(window.localStorage.getItem('cfl.voice')).toBe('male');
    document.getElementById('instructorVoice').value = 'female';
    document.getElementById('instructorSettingsForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ preferences: expect.objectContaining({ voice: 'female' }) }));
    expect(window.localStorage.getItem('cfl.voice')).toBe('female');
  });

  it('sends a password reset link to the account email', async () => {
    const sendReset = vi.fn(async () => {});
    initInstructorSettings({ profile: { bio: '', preferences: {} }, email: 'i@x.co', saveProfile: vi.fn(), sendReset });
    document.getElementById('instructorPasswordReset').click();
    await flush();
    expect(sendReset).toHaveBeenCalledWith('i@x.co');
    expect(document.getElementById('instructorSettingsNote').textContent).toContain('i@x.co');
  });
});
