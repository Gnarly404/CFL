// Contact form in the shared footer. There is no server behind it: submitting opens the visitor's own email
// app with the message ready to send to the Centre, and says so. (Swap for a hosted form service later if wanted.)
export const CONTACT_EMAIL = 'cfllearning33@gmail.com';

export function mailtoUrl({ name, email, message }) {
  const subject = `Website enquiry from ${name}`;
  const body = `${message}\n\n${name}\n${email}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function initContactForm(root = document, open = (url) => { window.location.href = url; }) {
  const form = root.getElementById?.('contactForm') ?? root.querySelector('#contactForm');
  if (!form) return;
  const status = root.querySelector('#contactStatus');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    open(mailtoUrl({ name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), message: String(data.get('message')).trim() }));
    if (status) status.textContent = `Your email app should open with your message ready to send. If it does not, write to ${CONTACT_EMAIL}.`;
  });
}

initContactForm();
