import {
  collection, doc, getDoc, getDocs, limit, query, where,
} from 'firebase/firestore';
import { call } from './callable.js';
import { AppError } from './errors.js';
import { dbService } from './firebase-db.js';
import fallbackProgrammes from '../../data/programmes.json';
import { mergeCatalog } from '@/utils/programme-schema.js';

function rows(snapshot) {
  if (snapshot.metadata?.fromCache) {
    throw new AppError('unavailable', "We can't reach the database right now. Check your connection and refresh.");
  }
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name ?? d.id,
      category: data.category ?? '',
      group: data.group ?? '',
      duration: data.duration ?? '',
      active: data.active !== false,
      ...(data.details && typeof data.details === 'object' ? { details: data.details } : {}),
    };
  });
}

async function catalogueMeta(db) {
  const snapshot = await getDoc(doc(db, 'catalogMeta', 'programmes'));
  const data = snapshot.exists() ? snapshot.data() : {};
  return {
    deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [],
    inactiveIds: Array.isArray(data.inactiveIds) ? data.inactiveIds : [],
  };
}

/** Active saved programmes plus presets not removed or unpublished by an administrator. */
export async function listPublicProgrammes({ max = 200 } = {}) {
  const db = dbService();
  const [snapshot, meta] = await Promise.all([
    getDocs(query(collection(db, 'programmes'), where('active', '==', true), limit(max))),
    catalogueMeta(db),
  ]);
  const hidden = [...new Set([...meta.deletedIds, ...meta.inactiveIds])];
  return mergeCatalog(rows(snapshot), fallbackProgrammes, hidden).filter((programme) => programme.active !== false);
}

/** Every non-deleted programme, including inactive ones, for staff. */
export async function listCatalog({ max = 200 } = {}) {
  const db = dbService();
  const [snapshot, meta] = await Promise.all([
    getDocs(query(collection(db, 'programmes'), limit(max))),
    catalogueMeta(db),
  ]);
  return mergeCatalog(rows(snapshot), fallbackProgrammes, meta.deletedIds);
}

export const saveProgramme = (data) => call('adminSaveProgramme', data);
export const deleteProgramme = ({ id }) => call('adminDeleteProgramme', { id });
