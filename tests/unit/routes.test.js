import { describe, expect, it } from 'vitest';
import {
  canAccess, homeFor, isSafeInternalPath, loginUrl, postLoginDestination, ROUTES,
} from '@/core/routes.js';

describe('homeFor', () => {
  it('maps each role to its portal and unknown roles to login', () => {
    expect(homeFor('student')).toBe('/student/dashboard');
    expect(homeFor('instructor')).toBe('/instructor/dashboard');
    expect(homeFor('admin')).toBe('/admin/dashboard');
    expect(homeFor('hacker')).toBe(ROUTES.login);
    expect(homeFor(null)).toBe(ROUTES.login);
  });
});

describe('isSafeInternalPath (open-redirect protection)', () => {
  it.each(['/', '/student/dashboard', '/student/dashboard?tab=2#top'])('accepts %s', (value) => {
    expect(isSafeInternalPath(value)).toBe(true);
  });
  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/line\nbreak', '', undefined, null, 42])('rejects %j', (value) => {
    expect(isSafeInternalPath(value)).toBe(false);
  });
});

describe('canAccess', () => {
  it('keeps each portal to its roles', () => {
    expect(canAccess('student', '/admin/dashboard')).toBe(false);
    expect(canAccess('student', '/instructor/dashboard')).toBe(false);
    expect(canAccess('instructor', '/admin/dashboard')).toBe(false);
    expect(canAccess('admin', '/admin/dashboard')).toBe(true);
    expect(canAccess('admin', '/instructor/dashboard')).toBe(true);
    expect(canAccess('student', '/student/dashboard?tab=1')).toBe(true);
    expect(canAccess('admin', '/student/dashboard')).toBe(false);
  });
  it('treats everything else as public', () => {
    expect(canAccess('student', '/gallery')).toBe(true);
    expect(canAccess('student', '/')).toBe(true);
  });
});

describe('loginUrl and postLoginDestination', () => {
  it('builds a safe return link', () => {
    expect(loginUrl('/student/dashboard')).toBe('/login?next=%2Fstudent%2Fdashboard');
    expect(loginUrl('//evil.com')).toBe('/login');
    expect(loginUrl('/login?next=/x')).toBe('/login');
    expect(loginUrl(undefined)).toBe('/login');
  });
  it('returns people to where they were going only when they may go there', () => {
    expect(postLoginDestination('student', '/student/dashboard')).toBe('/student/dashboard');
    expect(postLoginDestination('student', '/gallery')).toBe('/gallery');
    expect(postLoginDestination('student', '/admin/dashboard')).toBe('/student/dashboard');
    expect(postLoginDestination('admin', null)).toBe('/admin/dashboard');
    expect(postLoginDestination('student', '//evil.com')).toBe('/student/dashboard');
    expect(postLoginDestination('student', '/login')).toBe('/student/dashboard');
  });
});
