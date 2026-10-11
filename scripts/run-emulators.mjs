// Starts the local emulators and keeps their data between runs, so demo accounts and applications survive a restart.
//   npm run emulators:keep
// Data is saved to ./emulator-data when you stop the emulators with Ctrl+C (git-ignored). Delete that folder to start fresh.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

export const DATA_DIR = 'emulator-data';

export function emulatorArgs(hasSavedData) {
  return [
    'firebase', 'emulators:start', '--project', 'demo-cfl', '--only', 'auth,functions,firestore,storage',
    ...(hasSavedData ? ['--import', DATA_DIR] : []),
    '--export-on-exit', DATA_DIR,
  ];
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('run-emulators.mjs')) {
  const saved = existsSync(resolve(DATA_DIR, 'firebase-export-metadata.json'));
  console.log(saved ? `Loading saved emulator data from ${DATA_DIR}.` : 'No saved data yet: starting empty. Run "npm run seed" in another terminal.');
  const child = spawn('npx', emulatorArgs(saved), { stdio: 'inherit', shell: true });
  child.on('exit', (code) => process.exit(code ?? 0));
}
