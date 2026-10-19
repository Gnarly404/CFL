# Staging project: setup and release checklist

Today only production exists (`centre-of-foreign-learni-82491`). `.firebaserc` has `REPLACE_WITH_STAGING_PROJECT_ID` for
`staging` and `default`, so a plain `firebase deploy` fails instead of reaching production. This checklist creates the
staging project and defines what must pass before anything goes to production.

## 1. Create the project

1. Firebase console: create a new project (suggested id: `centre-of-foreign-learni-staging`). Do not reuse production data.
2. Switch it to the Blaze plan. Cloud Functions and Secret Manager need it. Set a budget alert straight away.
3. Enable **Authentication > Email/Password** only.
4. Create **Firestore**. The location cannot be changed later; pick it deliberately (the functions run in `europe-west1`).
5. Create **Storage**.
6. Add a **Web app** and copy its config values.

## 2. Wire it into the repo

1. In `.firebaserc`, replace both `REPLACE_WITH_STAGING_PROJECT_ID` values with the new project id. Keep `default` on staging.
2. Create `.env.staging` from `.env.development.example`: set `VITE_USE_EMULATORS=false` and the real config values.
   Leave `VITE_APPCHECK_SITE_KEY` empty for now.
3. Create `functions/.env.<stagingProjectId>` from `functions/.env.example`. Set `APP_BASE_URL` to the staging URL,
   `MAIL_TRANSPORT=smtp` with the SMTP settings, a random `IP_HASH_SALT` (`openssl rand -hex 24`), and keep
   `ENFORCE_APP_CHECK=false`. These files are git-ignored on purpose.
4. Store the mail password: `firebase use staging && firebase functions:secrets:set SMTP_PASS`.

## 3. Deploy to staging

```bash
firebase use staging
firebase deploy
```

This builds the site, lints the functions, and deploys functions, Firestore rules and indexes, Storage rules and Hosting.
Then, in the console:

| Where | Do |
| --- | --- |
| Firestore > TTL policies | `rateLimits.expiresAt` and `emailVerifications.expiresAt` |
| Authentication > Settings > Authorized domains | Add the staging domain |
| Authentication > Settings | Email enumeration protection on; password policy as in `docs/SECURITY.md` |
| Google Cloud > Credentials | Restrict the web API key to the staging domain |
| Firestore > Rules | Confirm the deployed rules match `firestore.rules` (not "test mode") |

Create the first administrator from your machine (see README step 8) with `--project <stagingProjectId>`.

## 4. What to verify on staging before production

Nothing below has been exercised against a real project yet.

- **Real mail:** run the whole admissions loop, including the emailed verification code and the invitation email.
- **CSP:** with the browser console open, browse the public pages, sign in as admin, instructor and student, run a lesson,
  and submit a contact message. Any `[Report Only] Refused to...` line must be fixed or explained before the header
  is renamed to `Content-Security-Policy`.
- **Rules:** run `npm run test:rules` on a machine with Java 21, or read the latest CI result.
- **Real devices and browsers:** an Android phone and an iPhone; Chrome, Safari and Firefox. Check mobile layouts, keyboard-only
  navigation, a screen reader, microphone recording (Chrome records webm, Safari records mp4) and a real sign-in that survives
  closing and reopening the browser.
- **Rate limits and TTL:** submit repeatedly and confirm the limit message appears; later confirm expired counters disappear.
- **App Check (optional, last):** follow the rollout order in `docs/SECURITY.md`.

## 5. Promote to production

Only when section 4 is clean:

```bash
firebase use production
firebase deploy
```

Before that, repeat sections 2 and 3 for production: `.env.production`, `functions/.env.centre-of-foreign-learni-82491`
(with its own `IP_HASH_SALT`), `SMTP_PASS`, the TTL policies, authorized domains, API-key restriction and budget alert.
Rotate the Gmail app password first (`docs/SECURITY.md`, "Do this now").
