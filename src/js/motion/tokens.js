/** Motion constants. Keep in step with the motion tokens in css/motion.css and css/tokens.css. */
export const EASE = Object.freeze({
  out: [0.22, 1, 0.36, 1], // arrivals: fast start, soft landing
  inOut: [0.76, 0, 0.24, 1], // page veil: committed in both directions
});

/** Seconds. Reveal is 12 to 32px of travel, once per entry (spec 23.2). */
export const DUR = Object.freeze({ micro: 0.18, swap: 0.32, reveal: 0.7, progress: 0.9, veilIn: 0.5, veilOut: 0.62 });

export const STAGGER = 0.06;
export const TRAVEL = 24; // px
