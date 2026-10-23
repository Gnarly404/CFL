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
| Resource limits and billing | Callable functions are capped at 5 instances each, with 40 concurrent requests per instance. Create Cloud Billing budget notifications and alert recipients; budgets notify but do not cap spend. Set function quotas and monitor estimated charges. |
| App Check | Register each deployed web app with reCAPTCHA Enterprise App Check, put its site key in `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` before building Hosting, then deploy. Every callable requires a valid App Check token. The Functions emulator deliberately skips enforcement. |
| Logging alerts | In Cloud Logging, create a log-based counter metric with filter `jsonPayload.event="security.rate_limit"` and alert on a sustained increase. Also alert on Cloud Functions error rate and App Check rejections. Rate-limit events are sampled to at most one log per IP/account dimension every five minutes. |

## How access control works

- **Roles** (`student`, `instructor`, `admin`) are custom claims set only by Cloud Functions. Browsers cannot change them.
- **Firestore rules** read the claim from the token. Identity, admissions, enrolments, payments, certificates, audit logs
  and counters are server-written only. Students write only their own learning state.
- **Privileged functions** (`decideApplication`, `adminCreateUser`, `adminSetUserStatus`, `adminSetUserRole`,
  `adminResendInvite`, `adminAssignProgramme`, `adminSaveProgramme`) look the caller up in Firebase Auth on every call, so demoting or disabling someone takes effect
  immediately, not when their token expires. Disabling an account also revokes its sessions.
- **Public functions** (`submitApplication`, `getApplicationStatus`) validate input on the server, rate-limit by hashed
  IP and by email or reference, ignore a hidden honeypot field, and never reveal whether an email or reference exists.
- **All callable functions** require App Check, and share hashed IP (300 calls/hour) and authenticated-account (600 calls/hour) limits. Endpoint-specific limits remain in place. Password-reset emails are generated server-side, limited to one per email every 15 minutes and five per email per day, and the response does not reveal whether the account exists.
- **Network edge limits** are not configurable for Firebase Hosting or callable function URLs in this repository. These server limits run after a request reaches the Firebase function platform; App Check rejects unattested clients before handler code but is not a volumetric DDoS control. True edge rate limiting requires an external HTTPS Load Balancer with Cloud Armor and a backend topology that prevents clients from bypassing the protected load balancer. Treat that as a separate infrastructure change before claiming edge-level protection.
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
- No Content-Security-Policy yet: the pages still load Bootstrap, Font Awesome and fonts from CDNs. The design-system
  session self-hosts them and adds a strict policy.
- The security-rules tests (`npm run test:rules`) were written but could not be executed where this checkpoint was built
  (the emulator download was blocked). Run them once locally or in CI before trusting the rules.
