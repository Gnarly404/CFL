// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildFeesView, renderFees } from '@/student/fees.js';

const pay = (over) => ({
  id: 'a', amountMinor: 400000, paidAt: new Date('2026-10-01T09:00:00Z'), method: 'mpesa', purpose: 'tuition', reference: 'QWE123', status: 'confirmed', ...over,
});

describe('student fees view', () => {
  it('counts only live tuition payments toward the balance', () => {
    const view = buildFeesView({
      feeDueMinor: 1000000,
      payments: [pay({}), pay({ id: 'b', amountMinor: 300000, status: 'reversed' }), pay({ id: 'c', amountMinor: 50000, purpose: 'other' })],
    });
    expect(view.paidMinor).toBe(400000);
    expect(view.balance).toMatchObject({ key: 'part', balanceMinor: 600000 });
    expect(view.rows).toHaveLength(3);
  });

  it('shows an empty state when nothing is recorded and never leaks admin fields', () => {
    const empty = buildFeesView({});
    expect(empty.hasAnything).toBe(false);
    const box = document.createElement('div');
    renderFees(box, empty);
    expect(box.textContent).toContain('No fees or payments');
    const view = buildFeesView({ feeDueMinor: 500000, payments: [pay({ note: 'SECRET', reverseReason: 'SECRET', batchId: 'SECRET' })] });
    renderFees(box, view);
    expect(box.textContent).not.toContain('SECRET');
    expect(box.textContent).toContain('KES');
    expect(box.querySelector('[data-balance]').dataset.balance).toBe('part');
  });
});
