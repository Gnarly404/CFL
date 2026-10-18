import {
  VOICES, clipsSupported, findLine, getVoicePreference, playClip, setVoicePreference, stopClips,
} from './voice.js';

/**
 * The "Voice" choice in a settings form: a select (female or male) and a button that plays a short sample in
 * whichever voice is selected, before anything is saved. `saved` is the voice stored on the person's account.
 * Nothing changes the spoken audio until the form is saved and the caller runs `apply()`.
 */
export function mountVoiceSetting({ select, sample, saved } = {}) {
  if (!select) return { value: () => getVoicePreference(), apply() {} };
  const known = VOICES.includes(saved);
  // Keep this browser in step with the account, so every page speaks in the saved voice.
  if (known) setVoicePreference(saved);
  select.value = known ? saved : getVoicePreference();

  if (sample) {
    sample.hidden = !clipsSupported();
    sample.addEventListener('click', async () => {
      stopClips();
      sample.disabled = true;
      try {
        const clip = await findLine('home.welcome', select.value);
        if (clip) playClip(clip);
      } finally {
        sample.disabled = false;
      }
    });
  }
  select.addEventListener('change', () => stopClips());
  return {
    value: () => (VOICES.includes(select.value) ? select.value : getVoicePreference()),
    apply: () => setVoicePreference(VOICES.includes(select.value) ? select.value : getVoicePreference()),
  };
}
