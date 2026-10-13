/** The element itself (when it matches) plus everything inside it, so content added later is found too. */
export const pick = (root, selector) => [
  ...(root?.matches?.(selector) ? [root] : []),
  ...(root?.querySelectorAll?.(selector) ?? []),
];

/** Motion leaves inline opacity/transform behind while it runs; this puts the element back under the stylesheet. */
export const settle = (...nodes) => nodes.flat().forEach((node) => {
  node.style.removeProperty('opacity');
  node.style.removeProperty('transform');
});

/** Runs an animation and always resolves, even when the browser cannot play it. */
export const play = (run) => {
  try { return Promise.resolve(run()).catch(() => {}); } catch { return Promise.resolve(); }
};
