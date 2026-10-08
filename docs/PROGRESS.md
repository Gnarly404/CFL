# Progress log

The project is built in sessions so each one ends with a runnable checkpoint zip. To resume in a new conversation,
upload the latest zip and say "continue with session N"; this file is the handoff.

## Roadmap

| # | Session | Status |
| --- | --- | --- |
| 1 | Foundation: clean repo, auth and roles, admissions backend, rules, tests | **Done (this checkpoint)** |
| 2 | Design system and app shell | **Partly done**: tokens, components, student portal shell. Still open: self-hosted fonts and icons, CSP, shared public header/footer, admin and instructor shells |
| 3 | Student portal and dashboard | **Started**: Continue Learning and skill cards use real lesson progress. Still open: schedule, materials, fees from real data, profile and settings pages, email change |
| 4 | English Practice (hub, engine, six skills, results, mistake review) | **Started**: hub, lesson shell, Grammar (5 starter lessons) work end to end. Vocabulary also works (4 starter lessons). Still open: Listening, Speaking, Reading, Writing, a cross-lesson mistake review page, daily goal, recommendations |
| 5 | Public site, programmes, admissions pages | Planned |
| 6 | Admin and instructor tools, messaging and notifications | Planned |
| 7 | Personalisation, hardening (CI deploy, accessibility, performance, monitoring), final release zip | Planned |

The owner confirmed this order: student portal and English Practice come before the public site.

## Session 1: what was delivered

Against the release gate in the Production spec (section 3):

| Gate item | State |
| --- | --- |
| One canonical repository root | Done. The nested 2024-25 duplicate, `node_modules`, `.env`, stray files and Data Connect are gone; the OTP prototype is archived. |
| Valid manifests and lock files | Done. Root and `functions/`, exact versions, Node 22. |
| Hosting config and environment strategy | Done. `firebase.json`, `.firebaserc` aliases, `.env.*`, emulator config. Staging project id still to be filled in. |
| Lowercase, deterministic URLs | Done, with 301 redirects from every old filename. Enforced by `npm run check:routes`. |
| Real registration persistence and lifecycle | Done on the server and in the form (review step, consent, reference, draft recovery). The applicant status page comes with the public-site session. |
| Replace client-side password handling | Done. Firebase Authentication owns passwords; invitations use one-time links. |
| Server-side admin user creation | Done (callable functions, audit log, role checks against the live account). |
| Role claims, Firestore and Storage rules | Done. Written, but see "Not verified". |
| Canonical data model for learning state | Rules, indexes and documentation are in place; collections appear as their sessions build them. |
| Separate test environment | Emulator project `demo-cfl` works locally. A staging Firebase project still has to be created. |
| Baseline automated tests | Done (below). |
| Design tokens and components | Session 2. |

Also fixed along the way: a stray quote that broke the gallery page, a relative image path on the programmes page, a form
that scrolled sideways on phones after each step, steps that could not receive focus right after changing, and an
email field and consent checkbox that did not behave on small screens.

## Verification

| Check | Result |
| --- | --- |
| Lint (app and functions) | pass |
| Unit and function tests | 176 pass (18 files): validation, schema, workflow, routes, guards, error mapping, draft storage, all form and sign-in controllers against the real page markup, every Cloud Function against in-memory fakes |
| Production build | pass |
| Route integrity (`npm run check:routes`) | pass: 10 pages, 134 references, markup parses cleanly, redirects resolve, protected pages ship hidden. 24 placeholder `href="#"` links are reported as warnings |
| Real-browser smoke run (headless Chromium, stand-in Firebase Auth and Functions servers) | 43 of 43 checks pass: every page loads without script errors or missing files; guards redirect signed-out visitors; the whole application form on a phone-sized screen including submission and confirmation; sign-in for student, instructor and admin; wrong password; account without a role; sign-out; forgot password; valid, expired and used activation links |

### Not verified yet (please read)

- **Security-rules tests** (`tests/rules/`) are written but have not been run: the sandbox this checkpoint was built in cannot download the
  Firebase emulators. Run `npm run test:rules` once locally (needs Java 21) or let CI do it, and treat any failure as a rules bug.
  If you allow `storage.googleapis.com` in the environment's network settings, I can run them myself next session.
- **Cloud Functions against the real emulators and real email delivery.** The functions' logic is covered by unit tests with fakes,
  and the browser smoke run used stand-ins for the network calls, so the first real end-to-end run is the one in the README ("Try the whole
  admissions loop").
- The browser smoke harness lives outside the repository (it needs a Linux-only headless Chromium). The long-term replacement is
  a Playwright suite against the emulators in session 7.

## Decisions taken on your behalf (easy to reverse)

Production spec is the master document and v2 supplies design intent; Vite without a framework; Data Connect removed; functions in
`europe-west1` on Node 22; routes follow the Production spec (`/programmes`, `/student/dashboard`) rather than the v2 file names;
mail through SMTP behind one module (swap the provider in `functions/src/lib/mailer.js`); instructors cannot read student learning data
yet and nobody can create messages yet (both are deliberate, see docs/SECURITY.md).

## Known gaps carried forward

| For session | Item |
| --- | --- |
| 2 | Self-host fonts and icons, remove the duplicate Bootstrap and Font Awesome versions, add a strict Content-Security-Policy, design tokens, shared header/footer, replace emoji icons, remove placeholder `#` links. |
| 3 | Student dashboard still shows sample courses, schedule, materials and fees (labelled as sample on the page); profile and settings pages; account email change. |
| 4 | Practice content and engine; server-side marking for graded work. |
| 5 | Programmes into Firestore, programme detail pages and working filters (schedule and price filters never worked in the original), applicant status page, legal pages, contact form, real brochure link. |
| 6 | Decision notes in the admissions queue, instructor assignment, content management, messaging rules and instructor reads. |
| 7 | CI deploy with approvals, App Check, HTML cache policy, the sign-in page downloads about 160 kB of JavaScript because it checks account status through Firestore (can be slimmed), accessibility and performance audit, monitoring, backups. |

## Session 2 plan (design system and app shell)

Design tokens (colour, type, spacing, motion with reduced-motion support), a small component set (buttons, fields, alerts, cards,
tables, badges, modals), the shared public header and footer, the portal shell (navigation, user menu, mobile layout), self-hosted
fonts and icons, a Content-Security-Policy, and a visual pass over every existing page using those components.

## Questions for later sessions

1. Staging and production Firebase project ids, and the production domain (needed by session 7, useful earlier for authorized domains).
2. Which email provider will send production mail (Gmail/Workspace SMTP is fine for a pilot).
3. Logo and brand files in vector form, if they exist (session 2).
4. Who supplies the real programme list, fees and photos (session 5), and who will write or review English practice content (session 4); starter content can be generated meanwhile.

## Update after session 1

- Programmes page now renders the five real programmes from `src/data/programmes.json` (names from the live site; durations, fees and eligibility carried over from the old page and still to be confirmed).
- Student dashboard rebuilt on `tokens.css`, `components.css`, `portal.css`: sidebar, mobile bottom nav, Continue Learning empty state, six practice skills shown as Coming soon. No sample data is shown as real.
- 19 test files, 183 tests pass (install `functions/` dependencies first). Rules tests still not run.

## Update: English Practice (first slice)

- Routes `/student/practice` (hub) and `/student/practice/lesson?skill=grammar&id=...` (lesson runner: Learn, Practice with explained feedback, Results with mistake review).
- Lesson content is data: `src/data/practice/grammar.json`. **These 5 starter lessons (25 questions) were written by the assistant and need review by the curriculum owner before launch.** `validateLesson` and a test fail the build if a lesson file is malformed.
- Progress is saved to `lessonProgress/{uid}_{lessonId}` (status, attempts, bestPercent, lastPercent, missed question ids). Skill percent = completed lessons / total lessons. Practice answer keys ship to the browser, which is acceptable for ungraded practice (see SECURITY.md); graded assessments must be marked server-side.
- Shared pieces: `js/practice/engine.js` (pure logic), `js/ui/portal-shell.js` (sidebar and mobile nav), `js/ui/h.js` (safe DOM builder).
- Tests: 21 files, 195 pass, including a jsdom run through the whole lesson page. **Still not run:** the Firestore rules tests (need the emulators) and any real-browser check of the new pages.

### Vocabulary (second slice)

- 4 lessons (`src/data/practice/vocabulary.json`, 24 words, 20 questions): Family and friends, Food and drink, Around town, Time and routine. Same Learn, Practice, Results flow; the Learn step shows a word list with definitions and example sentences, and the results review repeats the example for each missed word. **Also written by the assistant; needs curriculum review.**
- The runner, hub and dashboard are now skill-agnostic: add a skill by adding its JSON, registering it in `js/practice/content.js` and marking it `available` in `js/practice/skills.js`.
- Not built yet: flashcard flip mode and true spaced repetition (words are not scheduled for review over time; a missed word is only shown again on that lesson's results).

### Mistake review (third slice)

- Wrong answers are saved to `mistakes/{uid}_{questionId}` with a spaced schedule: due in 1 day, then 3, then 7; the third correct answer once due resolves it. Correct answers on mistakes that are not yet due do not advance them (no gaming by retrying).
- `/student/practice/mistakes` lists open mistakes by skill; `/student/practice/lesson?skill=review` runs a mixed review of up to 10 due mistakes (`&all=1` for all open ones). The hub shows how many are due.
- `docs/SPEC-COVERAGE.md` maps every section of the Production spec to its status.
- Tests: 22 files, 215 pass, now including hub and My mistakes page tests.

### Reading and Listening (fourth slice)

- Reading: 3 passages in `src/data/practice/reading.json`, passage kept on screen (collapsible) during questions.
- Listening: 3 scripts in `src/data/practice/listening.json`, played with the browser's text-to-speech (`js/ui/speech.js`): Play/Stop, slow speed, ready/playing/finished/error states. If the browser has no speech support the transcript is shown up front; otherwise it appears after the questions. Voice and accent depend on the device; a recorded-audio field can replace the script later without changing the page.
- Vocabulary word lists now have a Listen button for pronunciation.
- Content again written by the assistant and needs review. 23 test files, 227 tests pass; speech tested against a fake `speechSynthesis` only, not real devices.

### Speaking (fifth slice)

- Phase 1 only (per spec): prompt, listen to the question (browser speech), record, play back, record again, self-check. 3 lessons in `src/data/practice/speaking.json`, 9 prompts.
- Recordings live in memory (`js/ui/recorder.js`) and are discarded when the student moves on. Nothing is uploaded, so no Storage rules are needed yet. Teacher review (Phase 2) will need an upload path, rules, retention and consent text.
- No automatic scores are shown. A lesson is marked completed only if at least one answer was recorded; the saved record holds how many were recorded and the self-check count, with `bestPercent: null`.
- Microphone permission denied, no microphone, microphone busy, unsupported browser and a 60-second limit are handled with clear messages. Tested with a fake `MediaRecorder` only; real Android and iOS browsers still need a hands-on check (Safari records mp4, Chrome webm).
- 24 test files, 241 tests pass.

### Next up
1. Run `npm run test:rules` and fix any rules bug (the lessonProgress rules are now used for real).
2. Writing (drafts), then daily goals and recommendations, flashcard mode.
3. Mistake review page and daily goal; weak-area recommendations.
4. Remaining session 2 items (self-hosted fonts and icons, CSP, shared public header and footer).
