import { clipsSupported, findLine, playClip, stopClips } from './voice.js';

/**
 * Any <button data-voice-line="home.welcome"> plays that interface line. "dash.auto" picks the
 * greeting for the time of day. The button hides itself on browsers that cannot play the clips.
 */
const resolve = (id, now = new Date()) => {
  if (id !== 'dash.auto') return id;
  const hour = now.getHours();
  return hour < 12 ? 'dash.morning' : hour < 18 ? 'dash.afternoon' : 'dash.evening';
};

export function initVoiceButtons(root = document) {
  const buttons = [...root.querySelectorAll('[data-voice-line]')];
  if (!clipsSupported()) { buttons.forEach((b) => { b.hidden = true; }); return; }
  let active = null;
  const clear = (button) => { button.removeAttribute('data-playing'); button.removeAttribute('data-loading'); button.setAttribute('aria-pressed', 'false'); };

  root.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-voice-line]') : null;
    if (!button) return;
    if (active === button) { stopClips(); clear(button); active = null; return; }
    if (active) clear(active);
    active = button;
    button.setAttribute('data-loading', '');
    const clip = await findLine(resolve(button.dataset.voiceLine));
    if (active !== button) return;
    button.removeAttribute('data-loading');
    if (!clip) { clear(button); active = null; return; }
    button.setAttribute('data-playing', '');
    button.setAttribute('aria-pressed', 'true');
    const done = () => { clear(button); if (active === button) active = null; };
    playClip(clip, { onend: done, onerror: done });
  });
}
