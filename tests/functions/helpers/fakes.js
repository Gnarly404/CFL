import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { OPEN_STATUSES } from '../../../functions/src/lib/shared/application-status.js';

export const fakeFieldValue = () => ({ serverTimestamp: () => 'SERVER_TS' });

/** Tiny in-memory Firestore: enough for the handlers' reads and writes. */
export function fakeDb() {
  const store = new Map();
  let counter = 0;
  const ref = (col, id) => ({
    id,
    async get() {
      const data = store.get(`${col}/${id}`);
      return { exists: data !== undefined, id, data: () => (data === undefined ? undefined : structuredClone(data)) };
    },
    async set(data, options = {}) {
      const key = `${col}/${id}`;
      store.set(key, options.merge ? { ...(store.get(key) ?? {}), ...data } : { ...data });
    },
    async update(patch) {
      const key = `${col}/${id}`;
      if (!store.has(key)) throw new Error(`no document ${key}`);
      store.set(key, { ...store.get(key), ...patch });
    },
  });
  return {
    store,
    collection(col) {
      return {
        doc: (id = `auto${++counter}`) => ref(col, id),
        async add(data) {
          counter += 1;
          store.set(`${col}/auto${counter}`, { ...data });
          return { id: `auto${counter}` };
        },
      };
    },
    runTransaction: async (fn) => fn({
      get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, p) => r.update(p),
    }),
  };
}

const authError = (code) => Object.assign(new Error(code), { code });

/** In-memory Firebase Auth admin API. */
export function fakeAuth(seed = []) {
  const users = new Map(seed.map((u) => [u.uid, { disabled: false, customClaims: {}, ...u }]));
  let counter = 100;
  return {
    users,
    revoked: [],
    async getUser(uid) {
      if (!users.has(uid)) throw authError('auth/user-not-found');
      return users.get(uid);
    },
    async getUserByEmail(email) {
      const found = [...users.values()].find((u) => u.email === email);
      if (!found) throw authError('auth/user-not-found');
      return found;
    },
    async createUser({ email, displayName }) {
      counter += 1;
      const user = { uid: `uid${counter}`, email, displayName, disabled: false, customClaims: {} };
      users.set(user.uid, user);
      return user;
    },
    async setCustomUserClaims(uid, claims) { users.get(uid).customClaims = claims; },
    async updateUser(uid, patch) { Object.assign(users.get(uid), patch); },
    async revokeRefreshTokens(uid) { this.revoked.push(uid); },
    async generatePasswordResetLink(email, settings) {
      return `https://project.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=CODE-${encodeURIComponent(email)}&apiKey=k&continueUrl=${encodeURIComponent(settings.url)}`;
    },
  };
}

export function fakeMailer() {
  const sent = [];
  return { sent, send: vi.fn(async (message) => { sent.push(message); }) };
}

export const allowAllLimiter = () => ({ hit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })) });

/** In-memory stand-in for applicationsRepo. */
export function fakeRepo(seed = []) {
  const apps = new Map(seed.map((a) => [a.id, { ...a }]));
  return {
    apps,
    findOpenByEmail: vi.fn(async (email) => [...apps.values()].find((a) => a.email === email && OPEN_STATUSES.includes(a.status)) ?? null),
    findByReference: vi.fn(async (reference) => [...apps.values()].find((a) => a.reference === reference) ?? null),
    getById: vi.fn(async (id) => apps.get(id) ?? null),
    create: vi.fn(async (fields, year) => {
      const id = `app${apps.size + 1}`;
      const reference = `CFL-${year}-${String(apps.size + 1).padStart(5, '0')}`;
      apps.set(id, { id, ...fields, reference, status: 'submitted', userId: null });
      return { id, reference };
    }),
    applyDecision: vi.fn(async (id, { status, by, userId }) => {
      Object.assign(apps.get(id), { status, decidedBy: by, ...(userId ? { userId } : {}) });
    }),
  };
}

export const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
export const log = () => ({ warn: vi.fn(), info: vi.fn() });
