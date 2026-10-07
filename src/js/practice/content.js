import grammar from '../../data/practice/grammar.json';
import vocabulary from '../../data/practice/vocabulary.json';
import { ROUTES } from '@/core/routes.js';

const CONTENT = { grammar, vocabulary };

export function getSkillContent(skillId) {
  return CONTENT[skillId] ?? { lessons: [] };
}

export const lessonUrl = (skillId, lessonId) => `${ROUTES.practiceLesson}?skill=${encodeURIComponent(skillId)}&id=${encodeURIComponent(lessonId)}`;
