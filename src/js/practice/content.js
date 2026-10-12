import grammar from '../../data/practice/grammar.json';
import listening from '../../data/practice/listening.json';
import reading from '../../data/practice/reading.json';
import speaking from '../../data/practice/speaking.json';
import writing from '../../data/practice/writing.json';
import vocabulary from '../../data/practice/vocabulary.json';
import { ROUTES } from '@/core/routes.js';
import { collection, getDocs } from 'firebase/firestore';
import { dbService } from '@/services/firebase-db.js';

const CONTENT = { grammar, vocabulary, reading, listening, speaking, writing };
let loadPromise = null;

/** Load instructor-managed curriculum, retaining bundled lessons when a document is absent or unavailable. */
export function loadPracticeContent() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const snapshot = await getDocs(collection(dbService(), 'practiceContent'));
      for (const document of snapshot.docs) {
        const skillId = document.id;
        const data = document.data();
        if (Object.hasOwn(CONTENT, skillId) && Array.isArray(data.lessons)) {
          CONTENT[skillId] = { skill: skillId, lessons: data.lessons };
        }
      }
    } catch (error) {
      console.warn('Could not load instructor-managed practice content', error?.code ?? error);
    }
    cached = null;
    return CONTENT;
  })();
  return loadPromise;
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
