# Centre of Foreign Learning (CFL)

Public website, admissions, student portal and admin tools for the Centre of Foreign Learning, built on Firebase
(Hosting, Authentication, Firestore, Cloud Functions, Storage) with a no-framework Vite front end.

> **Status:** foundation checkpoint (session 1 of 7). See [docs/PROGRESS.md](docs/PROGRESS.md) for what is done,
> what is next, and what could not be verified yet.

## What you need

- Node.js 22 or newer
- Java 21 or newer (only for the Firebase emulators and the security-rules tests)
- A Firebase project for staging and one for production (the repo works locally with no project at all)

## First run (local, no cloud project needed)

```bash
npm ci
npm --prefix functions ci

# Local settings for the functions emulator (both files are git-ignored)
cp functions/.secret.local.example functions/.secret.local
printf 'APP_BASE_URL=http://localhost:5173\nMAIL_TRANSPORT=console\n' > functions/.env.local

npm run emulators      # terminal 1: Auth, Firestore, Functions, Storage
npm run seed           # terminal 2: demo accounts and sample applications
npm run dev            # terminal 3: the site at http://localhost:5173
```

Demo accounts (password `Passw0rd!demo`): `admin@cfl.test`, `instructor@cfl.test`, `student@cfl.test`.
Emails are not sent locally: activation links appear in the emulator's functions log, and in the admin console
when you create an account.

Try the whole admissions loop: open `/register`, submit an application, sign in as the admin, approve it, copy the
activation link from the functions log, open it, choose a password, sign in as the new student.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload (talks to the emulators) |
| `npm run build` | Production build into `dist/` |
| `npm run verify` | Shared-code check, lint, unit tests, build and route check (run this before every commit) |
| `npm test` | Unit and function tests (no emulator needed) |
| `npm run test:rules` | Firestore and Storage security-rules tests (starts the emulators; needs Java) |
| `npm run check:routes` | Verifies every link and asset in the built site, hosting redirects, file naming and page guards |
| `npm run sync:shared` | Copies the shared validators from `src/js/utils` into `functions/src/lib/shared` |
| `npm run bootstrap-admin` | Creates or promotes the first administrator (see below) |

## Project layout

```
src/                     Vite root: every .html file here is a page
  css/                   Stylesheets (foundation.css is shared by all pages)
  js/core/               Config and the route table (single source of truth for URLs)
  js/services/           Firebase access: one module per product, so pages load only what they use
  js/auth/               Session, guards, sign-in and activation controllers
  js/registration/       Application form controller, draft storage, validation wrapper
  js/admin/              Admin console controller
  js/pages/              Tiny entry scripts, one per page
  js/utils/              Pure helpers; validation, schema, status and roles are shared with the server
public/images/           Static images (served as-is)
functions/               Cloud Functions (Node 22, ES modules)
  src/lib/               Mailer, templates, rate limiter, repositories, account provisioning
  src/applications/      submitApplication, getApplicationStatus, decideApplication
  src/admin/, src/auth/  Account administration and activation
firestore.rules, storage.rules, firestore.indexes.json, firebase.json, .firebaserc
scripts/                 check-routes, sync-shared, bootstrap-admin, seed-emulator
tests/                   unit/, functions/, rules/ (emulator)
docs/                    ARCHITECTURE.md, SECURITY.md, PROGRESS.md
archive/                 Material that is kept for reference and not shipped (OTP prototype)
```

## Deploying

1. Create the Firebase projects, enable Authentication (Email/Password), Firestore and Storage.
2. Put the project ids in `.firebaserc` (`staging`, `production`). The `default` alias deliberately points at staging, so a plain `firebase deploy` can never reach production by accident.
3. Copy `.env.example` to `.env.production` (and `.env.staging`) and fill in the web-app settings from the Firebase console.
4. Copy `functions/.env.example` to `functions/.env.<projectId>` and fill it in.
5. Store the mail password as a secret: `firebase use <alias>` then `firebase functions:secrets:set SMTP_PASS`.
6. Work through the console checklist in [docs/SECURITY.md](docs/SECURITY.md) (authorized domains, password policy, TTL policy).
7. `firebase deploy` (it builds the site and lints the functions first).
8. Create the first administrator from your own machine:

   ```bash
   gcloud auth application-default login
   node scripts/bootstrap-admin.mjs --project <project-id> --email you@example.com --name "Your Name" --base-url https://your-domain
   ```

   Open the printed one-time link to choose a password.

Staging first, production second: `firebase use staging && firebase deploy`, check it, then `firebase use production && firebase deploy`.

## Conventions

- URLs: lowercase, no spaces, no `.html` in links. Add new routes to `src/js/core/routes.js` and a redirect to `firebase.json` if an old URL must keep working.
- A page under `/student`, `/instructor` or `/admin` must start with `<html data-auth="pending">` and call `guardPage()`; `npm run check:routes` fails if it does not.
- Browsers never write privileged data. Anything that creates accounts, changes roles or decides applications is a Cloud Function.
- Edit shared validators in `src/js/utils/` only, then run `npm run sync:shared` (a test fails if the copy drifts).
- Build DOM with `el()` or `textContent`, never `innerHTML` with user-supplied text.
