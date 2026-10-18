import { initMotion } from './index.js';

initMotion();

// Spoken interface lines work with or without motion. The click handling is delegated, so buttons that
// pages add later (such as the feedback button on lesson results) work too.
import('../ui/voice-buttons.js').then((module) => module.initVoiceButtons()).catch(() => {});

// Sound, a pulse or shake, and a short vibration when a page reports a success or an error. It works with or
// without motion (the visual part is switched off by Reduce motion; the sound has its own setting).
import('../ui/feedback.js').then((module) => module.initFeedback()).catch(() => {});
