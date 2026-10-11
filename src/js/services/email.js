import emailjs from '@emailjs/browser';

emailjs.init({
  publicKey: 'TzOyCSDwTHnIDp-DN',
});

const EMAIL_SERVICE_ID = 'service_6a534o8';
const OTP_TEMPLATE_ID = 'template_mx4dnx9';
const INVITATION_TEMPLATE_ID = 'template_6s9xdja';

export async function sendVerificationCode({
  email,
  name,
  passcode,
  expiresIn,
}) {
  return emailjs.send(
    EMAIL_SERVICE_ID,
    OTP_TEMPLATE_ID,
    {
      email,
      name,
      passcode,
      time: expiresIn,
    },
  );
}

export async function sendAccountInvitation({
  email,
  displayName,
  role,
  activationUrl,
}) {
  if (!email || !activationUrl) {
    throw new Error('The invitation email or activation link is missing.');
  }

  return emailjs.send(
    EMAIL_SERVICE_ID,
    INVITATION_TEMPLATE_ID,
    {
      to_email: email,
      to_name: displayName || email,
      role,
      activation_url: activationUrl,
    },
  );
}
