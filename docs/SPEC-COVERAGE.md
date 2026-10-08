# Spec coverage

Tracks every section of `CFL Production Level UX/UI Engineering Specification` against the code, so nothing is dropped between sessions. Status is what is in `main`, not what is planned. "Verified" means checked by tests or in a browser; tests are listed in PROGRESS.md.

Status key: **Done**, **Partial**, **Not started**.

| Spec section | Status | What exists / what is missing |
|---|---|---|
| 2 Codebase audit, 3 Release gate | Partial | P0 code fixes done (one repo, Firebase Auth, Cloud Function admin creation, rules, routes). Missing: rules tests never run, no staging project, secret rotation unconfirmed |
| 4 Architecture and routes | Done | Lowercase routes, 301s from old filenames, route checker in CI |
| 5, 17 Public site, programme cards, admissions | Partial | Cards simplified and rendered from `programmes.json`. Missing: programme detail pages, public hero and CTA strategy, applicant status page, legal and contact pages, 12 placeholder `#` links |
| 6 Student portal navigation | Partial | Sidebar and mobile nav shipped. Schedule, Progress, Messages pages do not exist |
| 7 Dashboard | Partial | Continue Learning and skill cards use real progress. Missing: Today's Practice, schedule, materials, fees from real data |
| 8 Practice architecture and persistence | Partial | Hub, lesson lifecycle, saved lesson progress. Missing: practice session records, resuming a half-finished lesson, per-question attempt log |
| 9 Grammar | Partial | 5 lessons (assistant-written, need review), explained feedback, retry. Missing: more lessons, levels |
| 10 Vocabulary | Partial | 4 lessons, word list, quiz, spaced review of missed words. Missing: flashcard flip mode, pronunciation audio |
| 11 Listening | Not started | Needs audio (recordings or browser text-to-speech) |
| 12 Speaking | Not started | Phase 1 is record and playback |
| 13 Reading | Not started | |
| 14 Writing | Not started | Drafts and checklist feedback first; instructor feedback later |
| 15 Results, mistakes, feedback | Partial | Result screen with review, mistake bank, spaced review (1, 3, 7 days), My mistakes page. Missing: time spent, per-question attempts, skill-level mistake filters |
| 16 Progress, goals, personalisation | Partial | Skill progress and Continue Learning. Missing: daily goals, recommendations, streaks and achievements, placement and CEFR (v2 spec) |
| 18, 19 Auth and security | Partial | Firebase Auth, roles, rules written. Missing: rules tests run, App Check, rate limits, Content-Security-Policy, secret rotation |
| 20 Data model | Partial | `lessonProgress`, `mistakes` in use. Others exist in rules but are not used |
| 21 Frontend architecture | Partial | Shared shell, DOM helper, engine, content registry. Missing: shared public header and footer, other portal shells |
| 22 Visual design system | Partial | Tokens and components. Missing: self-hosted fonts, one icon library, duplicate Bootstrap and Font Awesome removal |
| 23 Motion and parallax (v2 spec 11) | Not started | Tokens for timing exist; no scroll or parallax modules |
| 24 Mobile | Partial | Bottom nav, 44px targets. Not checked on a device |
| 25 Accessibility | Partial | Focus management, labelled controls, reduced-motion tokens. No audit run |
| 26 Performance | Not started | |
| 27 Notifications and messaging | Not started | |
| 28 Admin and instructor product | Not started | Instructor page is a placeholder; admin dashboard is minimal |
| 29 Analytics and audit | Not started | Audit logging exists for admin actions only |
| 30 Content management | Not started | Lesson content is JSON in the repo |
| 31 QA | Partial | 22 unit and page-flow test files, 215 tests. Missing: rules tests, end-to-end, accessibility checks |
| 32 CI/CD and environments | Partial | CI configured. No staging |
| 33 Repo structure | Partial | |
| 34, 35, 36 Roadmap, Definition of Done, Launch checklist | Not met | |

## Needs a decision or input from the owner
- Review of all lesson content (Grammar and Vocabulary so far).
- Listening: audio recordings, or browser text-to-speech as a stand-in.
- Real programme details (fees, intakes, photos) and a production domain.
- Mail provider for transactional email; confirm the Gmail app password was rotated.
