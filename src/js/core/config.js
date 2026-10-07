// Public Firebase web-app settings come from Vite env files (.env.development / .env.production).
// They identify the project; they are not secrets. Never put server secrets in VITE_* variables.
const env = import.meta.env;

export const firebaseConfig = Object.freeze({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const useEmulators = env.VITE_USE_EMULATORS === 'true';
export const emulatorHost = env.VITE_EMULATOR_HOST || '127.0.0.1';
export const functionsRegion = env.VITE_FUNCTIONS_REGION || 'europe-west1';
