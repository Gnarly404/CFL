// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function mount() {
  vi.resetModules();
  document.body.innerHTML = `<nav class="navbar"><div class="nav-container">
    <button class="site-nav-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="site-nav-links"><span></span><span></span><span></span></button>
    <div class="nav-links" id="site-nav-links"><a href="/programmes">Programmes</a></div>
  </div></nav><main id="outside">Page</main>`;
  await import('@/ui/site-nav.js');
  return document.querySelector('.site-nav-toggle');
}

describe('responsive site navigation', () => {
  beforeEach(() => { vi.stubGlobal('innerWidth', 390); });

  it('toggles the menu and updates its accessible state', async () => {
    const toggle = await mount();
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close navigation');
    expect(document.querySelector('.navbar').dataset.menuOpen).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and restores focus to the toggle', async () => {
    const toggle = await mount();
    toggle.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes when a navigation link or outside area is clicked', async () => {
    const toggle = await mount();
    toggle.click();
    document.querySelector('#outside').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    const link = document.querySelector('.nav-links a');
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});