import { setGlobalOptions } from 'firebase-functions/options';
import { REGION } from './src/lib/config.js';

// Must run before any `onCall` / `onRequest` modules load (see index.js).
setGlobalOptions({ region: REGION, maxInstances: 5, concurrency: 40 });
