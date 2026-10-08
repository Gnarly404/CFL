import grammar from '../../data/practice/grammar.json';
import listening from '../../data/practice/listening.json';
import reading from '../../data/practice/reading.json';
import speaking from '../../data/practice/speaking.json';
import vocabulary from '../../data/practice/vocabulary.json';
import { ROUTES } from '@/core/routes.js';

const CONTENT = { grammar, vocabulary, reading, listening, speaking };

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
