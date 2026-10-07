import { call } from './callable.js';

/** Stores an application on the server. Resolves with { reference, status }. */
export const submitApplication = (payload) => call('submitApplication', payload);

/** Looks up progress with the reference and the email used to apply. */
export const getApplicationStatus = ({ reference, email }) => call('getApplicationStatus', { reference, email });
