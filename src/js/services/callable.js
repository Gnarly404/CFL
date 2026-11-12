import { httpsCallable } from 'firebase/functions';
import { functionsService } from './firebase-functions.js';
import { fromCallableError } from './errors.js';
import { trackPendingSave } from '@/utils/pending-saves.js';

/** Calls a Cloud Function and converts failures into user-safe AppErrors. */
export async function call(name, payload, { trackSave = true } = {}) {
  try {
    const request = () => httpsCallable(functionsService(), name)(payload);
    const { data } = await (trackSave ? trackPendingSave(request) : request());
    return data;
  } catch (error) {
    throw fromCallableError(error);
  }
}
