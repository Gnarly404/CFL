import { initMotion } from './index.js';

initMotion();

// Spoken interface lines work with or without motion. The click handling is delegated, so buttons that
// pages add later (such as the feedback button on lesson results) work too.
import('../ui/voice-buttons.js').then((module) => module.initVoiceButtons()).catch(() => {});
