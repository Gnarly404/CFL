import { httpsCallable } from 'firebase/functions';
import { functionsService } from './firebase-functions.js';
import { fromCallableError } from './errors.js';

/** Calls a Cloud Function and converts failures into user-safe AppErrors. */
export async function call(name, payload) {
  try {
    const { data } = await httpsCallable(functionsService(), name)(payload);
    return data;
  } catch (error) {
    throw fromCallableError(error);
  }
}
