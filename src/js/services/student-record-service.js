import { call } from './callable.js';

/**
 * The student database, through the Cloud Functions (administrators only). The browser never reads the
 * records collection directly: the server assembles each record from the application, the account and the
 * administrator's saved edits, and keeps identification numbers out of the list.
 */
export const listStudentRecords = () => call('adminListStudentRecords', {});
export const getStudentRecord = (uid) => call('adminGetStudentRecord', { uid });
export const saveStudentRecord = ({ uid, record }) => call('adminSaveStudentRecord', { uid, record });
