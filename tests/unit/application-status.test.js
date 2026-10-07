import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES, availableDecisions, canTransition, DECISIONS, OPEN_STATUSES,
} from '@/utils/application-status.js';

describe('application workflow', () => {
  it('allows forward decisions and blocks terminal states', () => {
    expect(canTransition('submitted', 'approved')).toBe(true);
    expect(canTransition('waitlisted', 'under_review')).toBe(true);
    expect(canTransition('approved', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('waitlisted', 'submitted')).toBe(false);
    expect(canTransition('nonsense', 'approved')).toBe(false);
  });

  it('offers sensible actions per status', () => {
    expect(availableDecisions('submitted')).toEqual(expect.arrayContaining(['start_review', 'approve', 'reject', 'waitlist', 'request_info']));
    expect(availableDecisions('under_review')).not.toContain('start_review');
    expect(availableDecisions('approved')).toEqual([]);
    expect(availableDecisions('rejected')).toEqual([]);
  });

  it('keeps the enumerations consistent', () => {
    for (const target of Object.values(DECISIONS)) expect(APPLICATION_STATUSES).toContain(target);
    for (const status of OPEN_STATUSES) expect(APPLICATION_STATUSES).toContain(status);
    expect(OPEN_STATUSES).not.toContain('approved');
  });
});
