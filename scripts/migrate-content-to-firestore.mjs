import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, arg } from './lib/admin.mjs';

const root = resolve(import.meta.dirname, '..');
const projectId = arg('project');
const apply = process.argv.includes('--apply');
const environment = readFileSync(resolve(root, '.env.production'), 'utf8');
const productionProjectId = environment.match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');

if (!projectId || !productionProjectId || projectId !== productionProjectId || projectId.startsWith('REPLACE_')) {
  console.error('Supply --project matching VITE_FIREBASE_PROJECT_ID in .env.production.');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to use an emulator. Unset FIRESTORE_EMULATOR_HOST before migrating production content.');
  process.exit(1);
}

const readJson = (relativePath) => JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
const programmes = readJson('src/data/programmes.json');
const skillIds = ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'];
const curriculum = skillIds.map((skill) => {
  const data = readJson(`src/data/practice/${skill}.json`);
  if (!Array.isArray(data.lessons) || data.lessons.length === 0) {
    throw new Error(`Invalid or empty source curriculum: ${skill}`);
  }
  return { collection: 'practiceContent', id: skill, data: { ...data, skill } };
});
if (!Array.isArray(programmes) || programmes.length === 0 || programmes.some((p) => typeof p.id !== 'string' || !p.id)) {
  throw new Error('Invalid or empty source programme catalogue.');
}
const { db } = connect(projectId);
const metaSnapshot = await db.collection('catalogMeta').doc('programmes').get();
const catalogueMeta = metaSnapshot.exists ? metaSnapshot.data() : {};
const deletedIds = new Set(Array.isArray(catalogueMeta.deletedIds) ? catalogueMeta.deletedIds : []);
const inactiveIds = new Set(Array.isArray(catalogueMeta.inactiveIds) ? catalogueMeta.inactiveIds : []);
const skippedDeleted = programmes.filter((programme) => deletedIds.has(programme.id));
const records = [
  ...programmes.filter((programme) => !deletedIds.has(programme.id)).map((programme) => ({
    collection: 'programmes',
    id: programme.id,
    data: { ...programme, active: inactiveIds.has(programme.id) ? false : programme.active ?? true },
  })),
  ...curriculum,
];

const inspected = await Promise.all(records.map(async (record) => {
  const ref = db.collection(record.collection).doc(record.id);
  const snapshot = await ref.get();
  return { ...record, ref, exists: snapshot.exists };
}));
const missing = inspected.filter((record) => !record.exists);
const existing = inspected.filter((record) => record.exists);
console.log(`Target Firebase project: ${projectId}`);
console.log(`Content documents: ${records.length} eligible; ${missing.length} missing; ${existing.length} already present and protected.`);
for (const programme of skippedDeleted) console.log(`SKIP DELETED programmes/${programme.id}`);
for (const record of inspected) {
  console.log(`${record.exists ? 'PRESERVE' : apply ? 'CREATE' : 'WOULD CREATE'} ${record.collection}/${record.id}`);
}
if (!apply) {
  console.log('Dry run only. Add --apply to create missing programme and curriculum documents.');
  process.exit(0);
}

for (const record of missing) {
  try {
    await record.ref.create(record.data);
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
    console.log(`PRESERVE ${record.collection}/${record.id} (created by another writer during migration)`);
  }
}
const verified = await Promise.all(records.map(async ({ collection, id }) => ({
  collection, id, exists: (await db.collection(collection).doc(id).get()).exists,
})));
const absent = verified.filter((record) => !record.exists);
if (absent.length) throw new Error(`Migration incomplete: ${absent.map((r) => `${r.collection}/${r.id}`).join(', ')}`);
console.log(`Migration complete: verified all ${verified.length} content documents. Existing documents were not overwritten.`);
