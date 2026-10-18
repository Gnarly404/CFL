import { setReduceMotionPreference } from '@/motion/reduced-motion.js';
import { mountVoiceSetting } from '@/ui/voice-setting.js';

export const BIO_MAX = 500;

/**
 * The instructor's own settings: reduced motion (which applies on every page), the short biography shown on
 * their dashboard, and a password reset link. Only what actually does something is offered here.
 * `profile` is the saved instructor record, or null when this person has none (an admin viewing the page).
 */
export function initInstructorSettings({
  root = document, profile, email, saveProfile, sendReset, onBio,
} = {}) {
  const dialog = root.getElementById('instructorSettingsDialog');
  const form = root.getElementById('instructorSettingsForm');
  if (!dialog || !form) return { open() {} };
  const reduce = root.getElementById('instructorReduceMotion');
  const bio = root.getElementById('instructorBioInput');
  const bioGroup = root.getElementById('instructorBioGroup');
  const note = root.getElementById('instructorSettingsNote');
  const reset = root.getElementById('instructorPasswordReset');
  const count = root.getElementById('instructorBioCount');
  const hasProfile = Boolean(profile);
  const voice = mountVoiceSetting({ select: root.getElementById('instructorVoice'), sample: root.getElementById('instructorVoiceSample'), saved: profile?.preferences?.voice });

  const say = (text, kind = 'info') => { note.textContent = text; note.dataset.kind = kind; note.hidden = !text; };
  reduce.checked = profile?.preferences?.reduceMotion === true;
  // Keep this browser in step with the saved choice so every page follows it.
  if (hasProfile) setReduceMotionPreference(reduce.checked);
  bioGroup.hidden = !hasProfile;
  bio.value = profile?.bio ?? '';
  const showCount = () => { count.textContent = `${bio.value.length}/${BIO_MAX}`; };
  bio.addEventListener('input', showCount);
  showCount();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const text = bio.value.replace(/\s+/g, ' ').trim();
    if (hasProfile && text.length > BIO_MAX) { say(`Keep your biography under ${BIO_MAX} characters.`, 'error'); bio.focus(); return; }
    button.disabled = true;
    try {
      if (hasProfile) {
        const preferences = { ...profile.preferences, reduceMotion: reduce.checked, voice: voice.value() };
        await saveProfile({ bio: text, preferences });
        profile = { ...profile, bio: text, preferences };
        onBio?.(text);
      }
      setReduceMotionPreference(reduce.checked);
      voice.apply();
      say(hasProfile ? 'Settings saved. Reduced motion and your voice choice now apply on every page.' : 'Saved in this browser. Your account has no instructor profile to store it on.', 'success');
    } catch (error) {
      console.warn('Could not save instructor settings', error?.code ?? error);
      say('Your settings could not be saved. Check your connection and try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  reset.addEventListener('click', async () => {
    if (!email) { say('This account has no email address to send a link to.', 'error'); return; }
    reset.disabled = true;
    try {
      await sendReset(email);
      say(`A password reset link is on its way to ${email}.`, 'success');
    } catch (error) {
      console.warn('Could not send the password reset link', error?.code ?? error);
      say('The link could not be sent. Try again in a moment.', 'error');
    } finally {
      reset.disabled = false;
    }
  });

  const open = () => { say(''); if (!dialog.open) dialog.showModal?.(); };
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close?.(); });
  dialog.addEventListener('close', () => {
    if (root.defaultView?.location?.hash === '#settings') root.defaultView.history.replaceState(null, '', root.defaultView.location.pathname);
  });
  root.getElementById('openInstructorSettings')?.addEventListener('click', open);
  return { open };
}
