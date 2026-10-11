import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverInvitation } from '../../src/js/admin/invitation.js';

const person = { email: 'a@x.com', displayName: 'Amina', role: 'student' };
let send;
let say;
beforeEach(() => { send = vi.fn().mockResolvedValue(); say = vi.fn(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('invitation delivery', () => {
  it('sends the emulator link by EmailJS', async () => {
    expect(await deliverInvitation({ activationUrl: 'https://x/activate?a=1' }, person, { send, say })).toBe(true);
    expect(send).toHaveBeenCalledWith({ ...person, activationUrl: 'https://x/activate?a=1' });
    expect(say).toHaveBeenCalledWith(expect.stringContaining('sent to a@x.com'), 'success');
  });
  it('reports an EmailJS failure honestly', async () => {
    send.mockRejectedValue(new Error('quota'));
    expect(await deliverInvitation({ activationUrl: 'https://x' }, person, { send, say })).toBe(false);
    expect(say).toHaveBeenCalledWith(expect.stringContaining('failed for a@x.com'), 'error');
  });
  it('on the real project, no link means the server already sent it, with no false error', async () => {
    expect(await deliverInvitation({ uid: 'u', invited: true }, person, { send, say })).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(say.mock.calls[0][0]).toContain('sent by the server');
    expect(say.mock.calls[0][1]).toBe('info');
    expect(say.mock.calls[0][0]).not.toContain('emulator');
  });
  it('says so when the account is already active', async () => {
    expect(await deliverInvitation({ uid: 'u', invited: false }, person, { send, say })).toBe(false);
    expect(say.mock.calls[0][0]).toContain('already active');
  });
  it('handles an approval result that has no invited field', async () => {
    expect(await deliverInvitation({ status: 'approved', userId: 'u' }, person, { send, say })).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
