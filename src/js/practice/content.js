import { collection, getDocs } from 'firebase/firestore';
import { ROUTES } from '@/core/routes.js';
import { dbService } from '@/services/firebase-db.js';

const SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'];
const emptyContent = () => Object.fromEntries(SKILLS.map((skill) => [skill, { skill, lessons: [] }]));
let CONTENT = emptyContent();
let loadPromise = null;
let loadError = null;

/** Load curriculum from Firestore. There is no bundled runtime fallback. */
export function loadPracticeContent() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const snapshot = await getDocs(collection(dbService(), 'practiceContent'));
      const loaded = emptyContent();
      for (const document of snapshot.docs) {
        if (!Object.hasOwn(loaded, document.id)) continue;
        const data = document.data();
        if (!Array.isArray(data.lessons)) throw new Error(`Invalid curriculum document: ${document.id}`);
        loaded[document.id] = { skill: document.id, lessons: data.lessons };
      }
      const missing = SKILLS.filter((skill) => !snapshot.docs.some((document) => document.id === skill));
      if (missing.length) throw new Error(`Curriculum is missing Firestore documents: ${missing.join(', ')}`);
      CONTENT = loaded;
      loadError = null;
    } catch (error) {
      loadError = error;
      CONTENT = emptyContent();
      console.warn('Could not load curriculum from Firestore', error?.code ?? error);
    }
    cached = null;
    return CONTENT;
  })();
  return loadPromise;
}

export function practiceContentLoadError() {
  return loadError;
}

export function getSkillContent(skillId) {
  return CONTENT[skillId] ?? { lessons: [] };
}

export const lessonUrl = (skillId, lessonId) => `${ROUTES.practiceLesson}?skill=${encodeURIComponent(skillId)}&id=${encodeURIComponent(lessonId)}`;

let cached = null;
/** Every question by id, with where it came from. Used by mistake review. */
export function questionIndex() {
  if (cached) return cached;
  cached = {};
  for (const [skillId, content] of Object.entries(CONTENT)) {
    for (const lesson of content.lessons) {
      for (const question of lesson.questions ?? []) cached[question.id] = { skillId, lessonId: lesson.id, question };
    }
  }
  return cached;
}
