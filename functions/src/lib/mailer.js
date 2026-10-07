import nodemailer from 'nodemailer';
import * as logger from 'firebase-functions/logger';
import {
  MAIL_FROM, MAIL_TRANSPORT, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER,
} from './config.js';

export function createMailer(transport, from) {
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from, to, subject, text, html });
    },
  };
}

/** Local development: log the message (including any activation link) instead of sending it. */
export function consoleTransport(log = logger.info) {
  return {
    async sendMail(message) {
      log('[mail:console]', { to: message.to, subject: message.subject, text: message.text });
    },
  };
}

/** Builds the mailer from deployed settings. Call inside a request handler, not at module load. */
export function getMailer() {
  const from = MAIL_FROM.value();
  if (MAIL_TRANSPORT.value() === 'smtp') {
    const port = SMTP_PORT.value();
    const transport = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port,
      secure: port === 465,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    return createMailer(transport, from);
  }
  return createMailer(consoleTransport(), from);
}
