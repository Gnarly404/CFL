# OTP prototype (archived, not part of the product)

Found in the original upload as `OTP/` and `OTP.zip`. It is an unfinished email one-time-code sign-in idea.
It is kept here for reference only and is **not built, deployed or tested**.

Why it was not integrated:

- The `sendOtp`/`verifyOtp` functions trust a `uid` and `email` sent by the browser instead of the signed-in caller.
- Codes come from `Math.random()` rather than a cryptographically secure source.
- It targets the retired `functions.config()` API and a SendGrid key that would need to be rotated.
- It would create a second authentication system beside Firebase Authentication.

If two-step verification is wanted, use Firebase Authentication multi-factor (TOTP or SMS), which keeps one source of truth.
