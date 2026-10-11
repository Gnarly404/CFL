/**
 * What happens after an account is created or an invitation is resent.
 * - In the local emulator the server returns the activation link instead of emailing it, and this page sends it
 *   through EmailJS so the whole flow can be tried locally.
 * - On the real project the server emails the invitation itself and returns no link, so there is nothing to send here.
 */
export async function deliverInvitation(result, person, { send, say }) {
  if (result?.activationUrl) {
    try {
      await send({ ...person, activationUrl: result.activationUrl });
      say(`Invitation email sent to ${person.email}.`, 'success');
      return true;
    } catch (error) {
      console.error('EmailJS invitation failed:', error);
      say(`The account operation succeeded, but the invitation email failed for ${person.email}. Check your EmailJS configuration and try Resend invitation.`, 'error');
      return false;
    }
  }
  if (result?.invited === false) {
    say('This account is already active, so no invitation was needed.', 'info');
    return false;
  }
  say(`The invitation to ${person.email} was sent by the server. If it does not arrive, use Resend invitation.`, 'info');
  return true;
}
