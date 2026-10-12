// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountInstructorShell } from '@/ui/instructor-shell.js';

beforeEach(() => {
  document.body.innerHTML = '<aside id="portalSide"></aside><nav id="portalBottom"></nav>';
});

describe('instructor navigation', () => {
  it('shows the curriculum destination to instructors', () => {
    mountInstructorShell('curriculum', 'instructor');
    const link = document.querySelector('#portalSide a[href="/instructor/curriculum"]');
    expect(link?.getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('#portalBottom a[href="/instructor/curriculum"]')).not.toBeNull();
    expect([...document.querySelectorAll('#portalSide nav a, #portalBottom a')].every((entry) => entry.querySelector('svg'))).toBe(true);
  });

  it('does not expose instructor curriculum navigation to admins', () => {
    mountInstructorShell('dashboard', 'admin');
    expect(document.querySelector('#portalSide a[href="/instructor/curriculum"]')).toBeNull();
    expect(document.querySelector('#portalBottom a[href="/instructor/curriculum"]')).toBeNull();
  });
});