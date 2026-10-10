import { dayKey, sessionSeconds } from './goals.js';
import { recordSession } from '@/services/practice-service.js';

/**
 * Times one practice attempt and records it once when it finishes.
 * A failed write is only logged: the lesson itself already saved, and the goal total simply misses this session.
 */
export function startTracker({ uid, skill, lessonId, kind = 'lesson' }) {
  let start = Date.now();
  let done = false;
  return {
    async complete() {
      if (done) return true;
      done = true;
      try {
        await recordSession(uid, { skill, lessonId, kind, seconds: sessionSeconds(start, Date.now()), date: dayKey() });
        return true;
      } catch (error) {
        done = false;
        console.warn('Could not record the practice session', error?.code ?? error);
        return false;
      }
    },
    /** A new attempt of the same lesson starts a new session. */
    reset() { start = Date.now(); done = false; },
  };
}
