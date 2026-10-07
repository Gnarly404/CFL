# Architecture

```
Browser (Vite multi-page site, plain ES modules)
   |  Firebase Auth (sign-in, password links)      Firestore (reads, student-owned writes)
   |  Callable functions (everything privileged)   Storage (avatars, submissions, content)
   v
Firebase Hosting  --  Cloud Functions (Node 22)  --  Firestore / Auth Admin / Secret Manager / SMTP
```

## Routes

| URL | Page | Access |
| --- | --- | --- |
| `/` | `src/index.html` | public |
| `/programmes` | `src/programmes/index.html` | public |
| `/gallery` | `src/gallery.html` | public |
| `/register` | `src/register.html` (application form) | public |
| `/login`, `/activate` | sign-in; set or reset a password from an emailed link | public |
| `/student/dashboard` | student portal | role `student` |
| `/instructor/dashboard` | instructor workspace (placeholder) | roles `instructor`, `admin` |
| `/admin/dashboard` | admin console | role `admin` |

Old addresses (`/Programs.html`, `/Login.html`, `/public/...`, and so on) redirect with a 301; `/student`, `/instructor`
and `/admin` redirect to their dashboards. The table lives in `src/js/core/routes.js` and `firebase.json`;
`npm run check:routes` proves every link and redirect resolves. Planned: `/programmes/:id`, `/admissions/status`,
`/student/learning`, `/student/practice/...`.

## Accounts and roles

There is no self-sign-up. An account exists only because an administrator approved an application or created it.

1. A Cloud Function creates the Firebase Auth user with a random password and sets the custom claim `{ role }`.
2. It writes `users/{uid}` (status `invited`) and the role profile (`students/{uid}` or `instructors/{uid}`).
3. It emails `/activate?mode=resetPassword&oobCode=...&invite=1`. The one-time code is a normal Firebase password-reset code.
4. The person chooses a password (Firebase `confirmPasswordReset`) and signs in.
5. On first sign-in the browser sees `users/{uid}.status === 'invited'` and calls `activateAccount`, which marks the
   account `active` and the email verified.
6. Every protected page calls `guardPage({ roles })`, which reads the role from the ID token and redirects otherwise.

Account states: `invited` -> `active` <-> `disabled`. Disabling revokes refresh tokens. Role changes revoke them too,
so the person signs in again to get the new claim.

## Admissions

`submitApplication` (public) -> application `submitted` with a reference like `CFL-2026-00001` -> an admin moves it:

| From | Allowed next |
| --- | --- |
| submitted | under review, information requested, waitlisted, approved, declined |
| under review | information requested, waitlisted, approved, declined |
| information requested | under review, waitlisted, approved, declined |
| waitlisted | under review, approved, declined |
| approved, declined | none (final) |

Approval provisions the student account, creates `enrolments/{uid}_{programmeId}` when a programme was chosen, writes an
audit entry and sends the invitation. Every step is idempotent, so a retry after a partial failure is safe.
`getApplicationStatus` lets an applicant check progress with reference + email (page planned in the public-site session).

## Data model

Written by "server" means Cloud Functions (Admin SDK); rules deny browser writes.

| Collection | Written by | Read by | Notes |
| --- | --- | --- | --- |
| `users/{uid}` | server | owner, admin | role, status, displayName, email, createdAt, activatedAt, applicationId |
| `students/{uid}` | server; student edits `profile`, `preferences` | owner, admin, assigned instructor | profile (incl. `applicationReference`, guardian), preferences, `instructorIds` |
| `instructors/{uid}` | server; owner edits bio | signed in | bio, assignedCourses |
| `applications/{id}` | server | admin | reference, status, applicant, guardian, consent, statusHistory |
| `enrolments/{studentId_programmeId}` | server | owner, admin, assigned instructor | status, instructorIds, applicationId |
| `programmes`, `courses`, `units`, `lessons`, `questions`, `assignments` | admin | active/published to the right audience | arrive with their sessions |
| `practiceSessions`, `questionAttempts`, `lessonProgress`, `skillProgress`, `mistakes` | the student (own rows) | owner, admin | English Practice session |
| `submissions` | student (drafts), admin (grading) | owner, admin | |
| `schedules`, `attendance` | admin | signed in / owner | |
| `messages`, `notifications` | server (messaging session) | participants / owner | recipient may set `readAt` |
| `payments`, `certificates` | server | owner, admin | |
| `auditLogs` | server | admin | who did what, to what, when |
| `analyticsEvents` | signed-in user (own) | admin | |
| `counters`, `rateLimits` | server | nobody | reference numbers; rate-limit windows (TTL on `expiresAt`) |

## Front-end conventions

- One tiny entry script per page in `src/js/pages/`; behaviour lives in controllers that take their collaborators as
  arguments (`initLogin({ signInFn, navigate, ... })`), which is why they are testable without Firebase or a browser.
- Firebase is split per product (`firebase-auth.js`, `firebase-db.js`, `firebase-functions.js`) so the application form
  loads about 20 kB of Firebase code and does not download Firestore.
- Errors shown to people are `AppError`s or mapped by `describeAuthError`; raw Firebase messages are never displayed.
- Forms validate with the same schema the server uses (`application-schema.js`), then show errors beside the field.

## Decisions

| Decision | Why |
| --- | --- |
| Vite multi-page build, no UI framework | Matches the spec's page-per-route structure, keeps pages light, and a failed build catches broken imports. |
| Callable functions for anything privileged | Keeps secrets and role checks off the browser; one audit trail. |
| Roles in custom claims, re-verified server-side | Rules can read them cheaply; functions never trust a stale token. |
| Shared validators copied into `functions/` by a script | Firebase deploys only `functions/`; a test fails if the copy drifts. |
| Functions in `europe-west1`, Node 22 | Closer to Kenya than `us-central1`; Node 20 is at end of life. Change `REGION` and `VITE_FUNCTIONS_REGION` together. |
| Data Connect and the OTP prototype removed | Unused (Data Connect needs Cloud SQL and nothing referenced it); OTP trusted client-supplied identity. Kept in `archive/` for reference. |
| No client-side password handling | Firebase Authentication owns credentials. |
