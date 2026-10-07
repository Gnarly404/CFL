import { loadLessonProgress } from '@/services/practice-service.js';
import { getSkillContent } from './content.js';
import { lessonStatus, nextLesson, skillPercent } from './engine.js';
import { SKILLS } from './skills.js';

/** Progress for every skill that has content. `failed` is true if any skill's progress could not be loaded. */
export async function loadOverview(uid) {
  let failed = false;
  const entries = await Promise.all(SKILLS.filter((skill) => skill.available).map(async (skill) => {
    let progress = {};
    try {
      progress = await loadLessonProgress(uid, skill.id);
    } catch (error) {
      failed = true;
      console.warn('Could not load practice progress', skill.id, error?.code ?? error);
    }
    const { lessons } = getSkillContent(skill.id);
    return {
      skill,
      lessons,
      progress,
      percent: skillPercent(lessons, progress),
      done: lessons.filter((lesson) => lessonStatus(progress, lesson.id) === 'completed').length,
      next: nextLesson(lessons, progress),
    };
  }));
  return { entries, failed };
}
