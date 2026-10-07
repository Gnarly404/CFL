import { describe, expect, it } from 'vitest';
import { describeAuthError, isExpiredOrInvalidLink } from '@/auth/auth-errors.js';
import { AppError, fromCallableError } from '@/services/errors.js';

describe('describeAuthError', () => {
  it('gives the same answer for unknown email and wrong password, so accounts cannot be discovered', () => {
    const a = describeAuthError({ code: 'auth/wrong-password' });
    expect(describeAuthError({ code: 'auth/user-not-found' })).toBe(a);
    expect(describeAuthError({ code: 'auth/invalid-credential' })).toBe(a);
  });
  it('explains disabled accounts, throttling and network problems', () => {
    expect(describeAuthError({ code: 'auth/user-disabled' })).toMatch(/disabled/);
    expect(describeAuthError({ code: 'auth/too-many-requests' })).toMatch(/Too many/);
    expect(describeAuthError({ code: 'auth/network-request-failed' })).toMatch(/connection/);
  });
  it('falls back to a safe generic message and never leaks raw error text', () => {
    expect(describeAuthError({ code: 'auth/something-new', message: 'Firebase: internal detail' })).toBe('Something went wrong. Please try again.');
    expect(describeAuthError(undefined)).toBe('Something went wrong. Please try again.');
  });
  it('passes through messages from our own AppErrors', () => {
    expect(describeAuthError(new AppError('custom', 'Specific message'))).toBe('Specific message');
    expect(describeAuthError(new AppError('account-not-ready', 'x'))).toMatch(/isn't set up/);
  });
  it('recognises expired or used links', () => {
    expect(isExpiredOrInvalidLink({ code: 'auth/expired-action-code' })).toBe(true);
    expect(isExpiredOrInvalidLink({ code: 'auth/invalid-action-code' })).toBe(true);
    expect(isExpiredOrInvalidLink({ code: 'auth/other' })).toBe(false);
  });
});

describe('fromCallableError', () => {
  it('keeps server messages and field errors for validation failures', () => {
    const error = fromCallableError({ code: 'functions/invalid-argument', message: 'Check the highlighted fields.', details: { fieldErrors: { email: 'Bad' } } });
    expect(error.code).toBe('invalid-argument');
    expect(error.message).toBe('Check the highlighted fields.');
    expect(error.fieldErrors).toEqual({ email: 'Bad' });
  });
  it('replaces internal and network failures with friendly text', () => {
    expect(fromCallableError({ code: 'functions/internal', message: 'stack trace here' }).message).toMatch(/Something went wrong/);
    expect(fromCallableError({ code: 'functions/unavailable', message: 'x' }).message).toMatch(/can't reach/);
  });
});
