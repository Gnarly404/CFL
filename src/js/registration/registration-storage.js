// Draft recovery for the application form. A convenience only: drafts expire, and are
// removed as soon as the application is submitted.
const KEY = 'cfl.registration.draft.v1';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked (private mode, strict settings)
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createDraftStore(storage = browserStorage(), now = () => Date.now()) {
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(KEY) ?? 'null');
      return isPlainObject(parsed) && isPlainObject(parsed.data) ? parsed : null;
    } catch {
      return null;
    }
  };
  const remove = () => {
    try { storage?.removeItem(KEY); } catch { /* ignore */ }
  };

  return {
    save(data, step) {
      if (!storage) return;
      const previous = read();
      const timestamp = now();
      try {
        storage.setItem(KEY, JSON.stringify({
          data, step, createdAt: previous?.createdAt ?? timestamp, expiresAt: timestamp + DRAFT_TTL_MS,
        }));
      } catch { /* quota or blocked: the draft is optional */ }
    },
    load() {
      const draft = read();
      if (!draft) return null;
      if (typeof draft.expiresAt !== 'number' || draft.expiresAt <= now()) {
        remove();
        return null;
      }
      return { data: draft.data, step: Number.isInteger(draft.step) ? draft.step : 0 };
    },
    clear: remove,
  };
}
