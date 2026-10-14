// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe("the student's Reduce motion setting", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    delete document.documentElement.dataset.reduceMotion;
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.IntersectionObserver = class { observe() {} disconnect() {} };
  });

  it('is off by default, so motion runs', async () => {
    const { motionAllowed } = await import('@/motion/reduced-motion.js');
    expect(motionAllowed()).toBe(true);
  });

  it('turns the motion layer off on any page once saved, and remembers it in this browser', async () => {
    const { setReduceMotionPreference, motionAllowed } = await import('@/motion/reduced-motion.js');
    setReduceMotionPreference(true);
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(localStorage.getItem('cfl.reduceMotion')).toBe('true');
    expect(motionAllowed()).toBe(false);
  });

  it('is applied from the first paint on a later page load', async () => {
    localStorage.setItem('cfl.reduceMotion', 'true');
    const { motionAllowed } = await import('@/motion/reduced-motion.js');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(motionAllowed()).toBe(false);
  });

  it('tells a running motion layer to stop when it is switched on, and can be switched off again', async () => {
    const { setReduceMotionPreference, onReducedMotion, motionAllowed } = await import('@/motion/reduced-motion.js');
    const stop = vi.fn();
    onReducedMotion(stop);
    setReduceMotionPreference(true);
    expect(stop).toHaveBeenCalledTimes(1);
    setReduceMotionPreference(false);
    expect(localStorage.getItem('cfl.reduceMotion')).toBeNull();
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();
    expect(motionAllowed()).toBe(true);
  });
});
