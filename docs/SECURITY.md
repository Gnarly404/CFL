# Security notes

## Do this now (before anything else)

1. **Revoke the Gmail app password that was committed in `functions/functions/.env`** of the original upload, and
   create a new one if you still want to send mail through Gmail. Treat the old one as public.
   Also remove it from every copy of the old repository and from any place it was pasted.
   (Checked 19 October 2026: this repository's history contains no `.env` file and no password, so the exposure is in the
   original upload and wherever it was shared. Rotation happens in the Google account, not in this repo.)
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
| Firestore > TTL policies | Add a TTL policy for collection `rateLimits`, field `expiresAt`, so counters clear themselves. Add a second one for collection `emailVerifications`, field `expiresAt`, so used and abandoned verification codes disappear. |
| Firestore > Rules | Deploy `firestore.rules` from this repo. Check the live rules are not "test mode". |
| Project settings > Your apps | Restrict the web API key to your domains (HTTP referrers) in Google Cloud > Credentials. |
| Billing | Set a budget alert. Functions are limited to 10 instances each. |
| App Check | The code is ready but off. Register the web app under App Check with reCAPTCHA Enterprise, set `VITE_APPCHECK_SITE_KEY`, deploy, watch the metrics, and only then set `ENFORCE_APP_CHECK=true` in `functions/.env.<projectId>`. It applies to the four public callables (`submitApplication`, `getApplicationStatus`, `requestEmailVerification`, `verifyEmailCode`). |
| Function settings | `IP_HASH_SALT` in `functions/.env.<projectId>` must be a random value of 16+ characters (`openssl rand -hex 24`). The functions refuse a short or placeholder value. |
| EmailJS dashboard | The EmailJS public key and template ids are in the public web bundle (`src/js/services/email.js`). The key is meant to be public, but restrict it to your domains in EmailJS so nobody can send mail through your account. Production invitations are sent by the server over SMTP; the EmailJS path only runs in the local emulator. |

## How access control works

- **Roles** (`student`, `instructor`, `admin`) are custom claims set only by Cloud Functions. Browsers cannot change them.
- **Firestore rules** read the claim from the token. Identity, admissions, enrolments, payments, certificates, audit logs
  and counters are server-written only. Students write only their own learning state.
- **Privileged functions** (`decideApplication`, `adminCreateUser`, `adminSetUserStatus`, `adminSetUserRole`,
  `adminResendInvite`, `adminAssignProgramme`, `adminSaveProgramme`) look the caller up in Firebase Auth on every call, so demoting or disabling someone takes effect
  immediately, not when their token expires. Disabling an account also revokes its sessions.
- **Email verification** happens on the server. `requestEmailVerification` creates a six-digit code, stores only a salted
  hash of it in `emailVerifications`, and emails it. `verifyEmailCode` allows 5 guesses per code (counted in a transaction),
  a code lasts 10 minutes, a new one can be requested after 60 seconds, and requests are also rate-limited per connection and
  per address. A verified address stays valid for 30 minutes. `submitApplication` refuses an address that is not verified and
  uses the verification up, so one code cannot back several applications. The browser holds no code and decides nothing.
- **Public functions** (`submitApplication`, `getApplicationStatus`, `requestEmailVerification`, `verifyEmailCode`) validate input on the server, rate-limit by hashed
  IP and by email or reference, ignore a hidden honeypot field, and never reveal whether an email or reference exists.
- **Sign-in** gives the same message for unknown email and wrong password, and `?next=` can only point at the same site.
- **Passwords** are never handled by CFL code: Firebase Authentication owns them. New accounts get a random password the
  nobody knows and must use the emailed one-time link.

## Known limitations (tracked in docs/PROGRESS.md)

- Practice questions contain their answer keys and are readable by signed-in students. That is acceptable for ungraded
  practice; graded assessments must be marked by a function (planned with the English Practice session).
- Instructor access to student data is scoped to assignment. An instructor can read a student's **submitted** writing (never drafts) only when listed in that student's `instructorIds`, and can create or edit `feedback` only on submitted work of such a student. Instructors still cannot read lesson progress, mistakes, practice sessions or any other learning data, and can never write to `submissions`. Feedback is a separate document, so a student's text is never altered.
- Instructors can schedule classes only under their own `instructorId`, read only their assigned classes, and change only a class's scheduled/cancelled status. Students see only classes for programmes in which they are enrolled; admins can manage all schedules.
- Messages are created only by the `sendMessage` function. A student may message only a teacher listed in their `instructorIds`, and a teacher only students who list them; both accounts must exist and be active, text is plain (cleaned, 2000 characters, shown as text never markup), and each sender is limited to 30 messages an hour. Each message lists both people in `participants`; only they can read it. Admins cannot read conversations. Browsers can only mark a message they received as read.
- A signed-in token stays valid up to an hour. Role changes and disabling revoke refresh tokens, and privileged functions
  re-check the live role, but Firestore rules read the token. Keep that in mind for anything highly sensitive.
- The Content-Security-Policy is sent as `Content-Security-Policy-Report-Only` (see `firebase.json`). Fonts, icons and
  Bootstrap are self-hosted and the pages pass an enforced policy in test, but real sign-in, Firestore, Functions and mail
  traffic has not been observed. Sign in, apply, run a lesson and send a contact message with the browser console open; if
  no "[Report Only] Refused to..." lines appear, rename the header key to `Content-Security-Policy` to enforce it.
- The security-rules tests (`npm run test:rules`) need the Firebase emulators and Java 21. The first 26 were run on the
  owner's machine and passed (`docs/PROGRESS.md`); rules added since, including `/messages`, schedules, programme staff and
  `emailVerifications`, were written with tests that have not been run. CI runs them on every push to `main` and every pull request, so check
  the latest CI result before trusting the rules.
