import {
  collection, doc, getDoc, getDocs, orderBy, query, writeBatch,
} from 'firebase/firestore';
import { GALLERY_IMAGES } from '@/gallery/gallery-images.js';
import { dbService } from './firebase-db.js';

const GALLERY_COLLECTION = 'galleryImages';

function readImage(snapshot) {
  const data = snapshot.data();
  if (typeof data.title !== 'string' || typeof data.caption !== 'string'
    || !Number.isInteger(data.position) || typeof data.category !== 'string'
    || (data.path !== null && typeof data.path !== 'string')
    || (data.src !== null && typeof data.src !== 'string')) {
    throw new Error(`Gallery image "${snapshot.id}" has invalid saved data.`);
  }
  return {
    id: snapshot.id,
    title: data.title,
    caption: data.caption,
    position: data.position,
    category: data.category,
    path: data.path,
    src: data.src,
  };
}

export async function loadGalleryImages() {
  const db = dbService();
  const state = await getDoc(doc(db, 'siteContent', 'gallery'));
  if (!state.exists() || state.data().initialized !== true) {
    return GALLERY_IMAGES.map((image, position) => ({ ...image, position, path: null }));
  }
  const snapshot = await getDocs(query(collection(db, GALLERY_COLLECTION), orderBy('position')));
  return snapshot.docs.map(readImage);
}

/** Saves the ordered image list in small batches so no single Firestore batch exceeds its write limit. */
export async function saveGalleryImages(images) {
  const db = dbService();
  const collectionRef = collection(db, GALLERY_COLLECTION);
  const previous = await getDocs(collectionRef);
  const nextIds = new Set(images.map((image) => image.id));
  const nextPaths = new Set(images.map((image) => image.path).filter(Boolean));
  const retiredPaths = previous.docs
    .map((snapshot) => snapshot.data().path)
    .filter((path) => typeof path === 'string' && !nextPaths.has(path));
  const operations = [
    ...images.map((image, position) => ({
      type: 'set',
      ref: doc(db, GALLERY_COLLECTION, image.id),
      data: {
        title: image.title,
        caption: image.caption,
        position,
        category: image.category || 'students',
        path: image.path ?? null,
        src: image.path ? null : image.src,
      },
    })),
    ...previous.docs.filter((snapshot) => !nextIds.has(snapshot.id)).map((snapshot) => ({
      type: 'delete',
      ref: snapshot.ref,
    })),
  ];

  operations.push({
    type: 'set',
    ref: doc(db, 'siteContent', 'gallery'),
    data: { initialized: true },
  });
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(offset, offset + 400)) {
      if (operation.type === 'set') batch.set(operation.ref, operation.data);
      else batch.delete(operation.ref);
    }
    await batch.commit();
  }
  return retiredPaths;
}
