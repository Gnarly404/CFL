// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { WORKSPACES, initConsole, workspaceFor } from '@/admin/console.js';
import { setStat } from '@/admin/stats.js';

const markup = `
  <nav><a href="#admissions" data-workspace-link="admissions" aria-current="page">A</a>
  <a href="#people" data-workspace-link="people">P</a><a href="#academics" data-workspace-link="academics">C</a></nav>
  <h1 id="consoleTitle"></h1><p id="consoleBlurb"></p>
  <div data-workspace="admissions"><section id="applications"></section><section id="privacy-requests"></section></div>
  <div data-workspace="people" hidden><section id="accounts"></section></div>
  <div data-workspace="academics" hidden><section id="programme-staff"></section></div>
  <b data-stat="openApplications">—</b>`;
const shown = () => [...document.querySelectorAll('[data-workspace]')].filter((node) => !node.hidden).map((node) => node.dataset.workspace);

describe('admin console workspaces', () => {
  beforeEach(() => { document.body.innerHTML = markup; window.location.hash = ''; });

  it('maps a hash to the workspace that owns it, and falls back to admissions', () => {
    expect(workspaceFor('people')).toBe('people');
    expect(workspaceFor('programme-staff')).toBe('academics');
    expect(workspaceFor('teaching-assignments')).toBe('people');
    expect(workspaceFor('privacy-requests')).toBe('admissions');
    expect(workspaceFor('nonsense')).toBe('admissions');
    expect(workspaceFor('')).toBe('admissions');
    // every section named by a workspace must exist on the page, or a deep link would land nowhere
    expect(Object.values(WORKSPACES).flatMap((item) => item.sections)).toHaveLength(10);
  });

  it('opens the workspace named by the hash, keeps old section links working, and follows hash changes', async () => {
    window.location.hash = '#programme-staff';
    const consoleShell = initConsole();
    expect(consoleShell.current).toBe('academics');
    expect(shown()).toEqual(['academics']);
    expect(document.querySelector('[data-workspace-link="academics"]').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('[data-workspace-link="admissions"]').hasAttribute('aria-current')).toBe(false);
    expect(document.getElementById('consoleTitle').textContent).toBe('Academics');

    window.location.hash = '#people';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(shown()).toEqual(['people']);
    expect(document.getElementById('consoleTitle').textContent).toBe('People');
  });

  it('does nothing on a page without workspaces', () => {
    document.body.innerHTML = '<p>nothing here</p>';
    expect(initConsole()).toBeNull();
  });
});

describe('at-a-glance numbers', () => {
  beforeEach(() => { document.body.innerHTML = markup; });
  it('shows whole, non-negative numbers (without motion support the value simply changes)', () => {
    setStat('openApplications', 7);
    expect(document.querySelector('[data-stat]').textContent).toBe('7');
    setStat('openApplications', -3);
    expect(document.querySelector('[data-stat]').textContent).toBe('0');
    setStat('openApplications', 'not a number');
    expect(document.querySelector('[data-stat]').textContent).toBe('0');
  });
});
