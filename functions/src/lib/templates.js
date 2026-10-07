// Plain, accessible transactional emails. Every template returns { subject, text, html }.

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function layout(title, paragraphs, action) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="background:#1f4e79;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>`
      + `<p style="margin:0 0 14px;font-size:13px;color:#555">If the button does not work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : '';
  return `<!doctype html><html lang="en"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">`
    + `<h1 style="font-size:20px;margin:0 0 18px">${escapeHtml(title)}</h1>${body}${button}`
    + `<p style="margin:24px 0 0;font-size:13px;color:#555">Centre of Foreign Learning</p></body></html>`;
}

export function applicationReceived({ name, reference, baseUrl }) {
  const statusUrl = new URL('/admissions/status', baseUrl).toString();
  const lines = [
    `Hello ${name},`,
    `We have received your application. Your reference is ${reference}. Keep it safe: you will need it to check your application status.`,
    'Our admissions team will review it and email you with the outcome.',
  ];
  return {
    subject: `We received your application (${reference})`,
    text: `${lines.join('\n\n')}\n\nCheck your status: ${statusUrl}\n\nCentre of Foreign Learning`,
    html: layout('We received your application', lines, { url: statusUrl, label: 'Check application status' }),
  };
}

export function accountInvite({ name, activationUrl, role }) {
  const lines = [
    `Hello ${name},`,
    `An account has been created for you at the Centre of Foreign Learning (${role}). Choose a password to activate it.`,
    'This link works once and expires after a short time. If it has expired, use "Forgot password" on the sign-in page to get a new one.',
  ];
  return {
    subject: 'Activate your CFL account',
    text: `${lines.join('\n\n')}\n\nActivate your account: ${activationUrl}\n\nCentre of Foreign Learning`,
    html: layout('Activate your CFL account', lines, { url: activationUrl, label: 'Choose your password' }),
  };
}

const UPDATE_COPY = {
  waitlisted: 'Your application has been placed on the waiting list. We will contact you when a place opens.',
  rejected: 'We are not able to offer you a place at this time. Contact admissions if you would like to talk it through.',
  info_requested: 'We need a little more information to continue with your application. Our admissions team will contact you shortly.',
};

export function applicationUpdate({ name, reference, status, baseUrl }) {
  const statusUrl = new URL('/admissions/status', baseUrl).toString();
  const lines = [`Hello ${name},`, UPDATE_COPY[status] ?? 'There is an update on your application.', `Reference: ${reference}`];
  return {
    subject: `Update on your application (${reference})`,
    text: `${lines.join('\n\n')}\n\nCheck your status: ${statusUrl}\n\nCentre of Foreign Learning`,
    html: layout('An update on your application', lines, { url: statusUrl, label: 'Check application status' }),
  };
}
