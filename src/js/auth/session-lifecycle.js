export const SESSION_IDLE_MS = 45 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const LAST_ACTIVITY_KEY = (uid) => `cfl:last-activity:${uid}`;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];

export function startSessionLifecycle({ uid, onWarning, onExpire, now = Date.now, timers = globalThis }) {
  const key = LAST_ACTIVITY_KEY(uid);
  const readLastActivity = () => {
    const value = Number(sessionStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.min(value, now()) : now();
  };
  let lastActivity = readLastActivity();
  let lastPersistedActivity = lastActivity;
  let warningTimer;
  let expiryTimer;
  let expired = false;

  const clearTimers = () => {
    timers.clearTimeout(warningTimer);
    timers.clearTimeout(expiryTimer);
  };
  const schedule = () => {
    clearTimers();
    const remaining = Math.max(0, SESSION_IDLE_MS - (now() - lastActivity));
    if (remaining <= 0) {
      expired = true;
      onExpire();
      return;
    }
    if (remaining > WARNING_MS) warningTimer = timers.setTimeout(onWarning, remaining - WARNING_MS);
    expiryTimer = timers.setTimeout(() => {
      if (now() - lastActivity >= SESSION_IDLE_MS) {
        expired = true;
        onExpire();
      } else {
        schedule();
      }
    }, remaining);
  };
  const touch = () => {
    if (expired) return;
    lastActivity = now();
    if (lastActivity - lastPersistedActivity >= 10_000) {
      sessionStorage.setItem(key, String(lastActivity));
      lastPersistedActivity = lastActivity;
    }
    schedule();
  };

  if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(lastActivity));
  ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, touch, { passive: true }));
  schedule();

  return () => {
    clearTimers();
    ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, touch));
  };
}
