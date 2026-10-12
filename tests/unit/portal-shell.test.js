// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountPortalShell } from '@/ui/portal-shell.js';

beforeEach(() => {
  document.body.innerHTML = '<aside id="portalSide"></aside><nav id="portalBottom"></nav>';
});

describe('student account navigation', () => {
  it('places Settings beside Sign out on desktop and mobile navigation', () => {
    mountPortalShell('dashboard');
    const desktop = document.querySelector('#portalSide .portal-account');
    const mobile = document.getElementById('portalBottom');
    expect(desktop.querySelector('a[href$="#settings"]')?.textContent).toContain('Settings');
    expect(desktop.lastElementChild.textContent).toBe('Sign out');
    expect(mobile.querySelector('a[href$="#settings"]')?.textContent).toContain('Settings');
    expect(mobile.lastElementChild.getAttribute('data-action')).toBe('sign-out');
    expect([...document.querySelectorAll('#portalSide nav a, #portalBottom a')].every((link) => link.querySelector('svg'))).toBe(true);
  });
});