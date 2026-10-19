# Privacy and Terms: what CFL must confirm

`/privacy` and `/terms` were drafted from what the code does, not by a lawyer. The text is accurate to the code as of
19 October 2026. The items below are decisions only the Centre can make. Until they are settled, do not treat the policies
as approved.

## Decisions for CFL

1. **Who is the data controller?** The page says "the Centre of Foreign Learning". Confirm the legal entity (registered name
   and type) and put it in section 1. Confirm whether it is registered with the Office of the Data Protection Commissioner
   (ODPC) as a data controller and, if so, add the registration number.
2. **Official contact.** The page lists `cfllearning33@gmail.com` and 0722 840 989. Confirm these are the addresses the
   Centre wants on public documents, and who reads that inbox. A shared role mailbox on the Centre's own domain is safer than
   a personal Gmail account.
3. **Who answers data requests?** Students can file requests from their dashboard. Name the person or role who reviews the
   "Privacy requests" list in the admin console, and the time within which they reply (the page says "the time the law requires").
4. **Retention.** Section 5 has no periods. Decide, for each of these, how long it is kept after a student leaves or an
   application is declined, and then state the numbers: applications that were declined, student records and identity
   document numbers, fee and payment records (Kenyan tax and accounting rules may set a minimum), practice and writing
   history, messages, audit logs. The code does not delete any of these automatically today except rate-limit counters
   and email verifications (see the TTL policies in `docs/SECURITY.md`).
5. **Identity document numbers.** The application collects the number of a national ID, passport or birth certificate.
   Confirm this is needed at application time and not only at enrolment. If it is, say why in section 2.
6. **Email provider.** The page says "our email delivery provider". Name it once it is final (the code sends over SMTP; Gmail
   or Google Workspace is the pilot setup). Also confirm whether any EmailJS use remains; the admin console still uses it
   in the local emulator only.
7. **Children.** Many students are under 18. Confirm how guardian consent is recorded and who may ask for a child's data.
8. **Terms.** Confirm the governing-law, fee, refund and conduct sections reflect the Centre's actual rules.

## What the code does that the policy now states

| Policy statement | Where it comes from |
| --- | --- |
| Identity document type and number, address, qualification collected at application | `functions/src/applications/submit.js` |
| Student number, agreed fees, payment records with payer name and phone | `functions/src/lib/shared/student-record-schema.js`, `payment-schema.js` |
| Messages visible only to the two participants; Site gives admins no access | `firestore.rules` (`/messages`), `docs/SECURITY.md` |
| Students can file privacy requests in the portal | `functions/src/privacy/requests.js`, student dashboard "Privacy & Data" |
| Administrator actions logged | `functions/src/lib/audit.js` |
| Hashed IP and email kept briefly for rate limiting | `functions/src/lib/rate-limit.js` (`expiresAt` is written; deletion needs the Firestore TTL policy) |

## Statements that depend on console settings

- "A few days at most" for rate-limit data is true only after the Firestore TTL policies in `docs/SECURITY.md` are created.
  Firestore deletes expired documents within about a day or two of the expiry time, not instantly.
