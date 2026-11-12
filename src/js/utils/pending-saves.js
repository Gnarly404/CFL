const pendingSaves = new Set();

export function trackPendingSave(save) {
  const pending = Promise.resolve().then(typeof save === 'function' ? save : () => save);
  pendingSaves.add(pending);
  const remove = () => pendingSaves.delete(pending);
  pending.then(remove, remove);
  return pending;
}

export async function waitForPendingSaves() {
  const failures = [];
  while (pendingSaves.size) {
    const results = await Promise.allSettled([...pendingSaves]);
    failures.push(...results.filter((result) => result.status === 'rejected').map((result) => result.reason));
  }
  return failures;
}
