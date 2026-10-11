// Sets emulator hosts then runs seed-emulator.mjs (Windows-friendly; same as README env vars on Unix).
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
await import('./seed-emulator.mjs');
