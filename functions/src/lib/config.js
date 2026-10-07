import { defineInt, defineSecret, defineString } from 'firebase-functions/params';

/** Keep in sync with VITE_FUNCTIONS_REGION. Callable functions can live in any region. */
export const REGION = 'europe-west1';

// Non-secret settings: set in functions/.env.<projectId> (or functions/.env.local for the emulator).
export const APP_BASE_URL = defineString('APP_BASE_URL', {
  default: 'http://localhost:5000',
  description: 'Public site URL used in emailed links, for example https://cfl.example.com',
});
export const MAIL_TRANSPORT = defineString('MAIL_TRANSPORT', {
  default: 'console',
  description: '"smtp" sends real email; "console" only logs it (local development).',
});
export const MAIL_FROM = defineString('MAIL_FROM', { default: 'Centre of Foreign Learning <no-reply@example.com>' });
export const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.gmail.com' });
export const SMTP_PORT = defineInt('SMTP_PORT', { default: 465 });
export const SMTP_USER = defineString('SMTP_USER', { default: '' });
export const IP_HASH_SALT = defineString('IP_HASH_SALT', { default: 'cfl' });

// Secret: `firebase functions:secrets:set SMTP_PASS` (never put it in a .env file).
export const SMTP_PASS = defineSecret('SMTP_PASS');
