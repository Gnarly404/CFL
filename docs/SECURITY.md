# Security notes

## Do this now (before anything else)

1. **Revoke the Gmail app password that was committed in `functions/functions/.env`** of the original upload, and
   create a new one if you still want to send mail through Gmail. Treat the old one as public.
   Also remove it from every copy of the old repository and from any place it was pasted.
2. The new code never reads that file. Mail settings now live in `functions/.env.<projectId>` (non-secret) and
   Secret Manager (`SMTP_PASS`). `.env` files, `.secret.local` and service-account keys are git-ignored.
3. Google Workspace or Gmail SMTP is fine for a pilot (about 500 messages a day). For production volume use a
   transactional provider; only `functions/src/lib/mailer.js` needs to change.

## Firebase console checklist

| Where | Setting |
| --- | --- |
| Authentication > Sign-in method | Enable **Email/Password** only. Leave email-link and anonymous off. |
| Authentication > Settings > User actions | Keep **email enumeration protection** on. |
| Authentication > Settings > Password policy | Require at least 8 characters (the app also enforces letter + number). |
| Authentication > Settings > Authorized domains | Add your production and staging domains. Invitation links are rejected otherwise. |
| Authentication > Templates | Optional: set the action URL to `https://<your-domain>/activate` so "Forgot password" emails open the CFL page. Invitations already do. |
| Firestore > TTL policies | Add a TTL policy for collection `rateLimits`, field `expiresAt`, so counters clear themselves. |
| Firestore > Rules | Deploy `firestore.rules` from this repo. Check the live rules are not "test mode". |
| Project settings > Your apps | Restrict the web API key to your domains (HTTP referrers) in Google Cloud > Credentials. |
| Billing | Set a budget alert. Functions are limited to 10 instances each. |
| App Check | Recommended before launch: enable reCAPTCHA Enterprise App Check and set `enforceAppCheck: true` on `submitApplication`. |

## How access control works

- **Roles** (`student`, `instructor`, `admin`) are custom claims set only by Cloud Functions. Browsers cannot change them.
- **Firestore rules** read the claim from the token. Identity, admissions, enrolments, payments, certificates, audit logs
  and counters are server-written only. Students write only their own learning state.
- **Privileged functions** (`decideApplication`, `adminCreateUser`, `adminSetUserStatus`, `adminSetUserRole`,
  `adminResendInvite`) look the caller up in Firebase Auth on every call, so demoting or disabling someone takes effect
  immediately, not when their token expires. Disabling an account also revokes its sessions.
- **Public functions** (`submitApplication`, `getApplicationStatus`) validate input on the server, rate-limit by hashed
  IP and by email or reference, ignore a hidden honeypot field, and never reveal whether an email or reference exists.
- **Sign-in** gives the same message for unknown email and wrong password, and `?next=` can only point at the same site.
- **Passwords** are never handled by CFL code: Firebase Authentication owns them. New accounts get a random password the
  nobody knows and must use the emailed one-time link.

## Known limitations (tracked in docs/PROGRESS.md)

- Practice questions contain their answer keys and are readable by signed-in students. That is acceptable for ungraded
  practice; graded assessments must be marked by a function (planned with the English Practice session).
- Instructor access to student learning data is intentionally closed until the instructor tools define assignment-scoped reads.
- Message creation is closed until messaging defines who may write to whom.
- A signed-in token stays valid up to an hour. Role changes and disabling revoke refresh tokens, and privileged functions
  re-check the live role, but Firestore rules read the token. Keep that in mind for anything highly sensitive.
- No Content-Security-Policy yet: the pages still load Bootstrap, Font Awesome and fonts from CDNs. The design-system
  session self-hosts them and adds a strict policy.
- The security-rules tests (`npm run test:rules`) were written but could not be executed where this checkpoint was built
  (the emulator download was blocked). Run them once locally or in CI before trusting the rules.
