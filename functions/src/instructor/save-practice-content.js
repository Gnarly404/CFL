import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

const SKILLS = new Set(['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing']);
const hasText = (value, max = 10000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const stringList = (value, { min = 1, max = 100 } = {}) => Array.isArray(value)
  && value.length >= min && value.length <= max && value.every((item) => hasText(item));

function validQuestion(question) {
  return question && hasText(question.id, 100) && hasText(question.prompt, 2000)
    && stringList(question.options, { min: 2, max: 8 })
    && Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length
    && hasText(question.why, 4000);
}

function validLesson(skillId, lesson) {
  if (!lesson || !hasText(lesson.id, 100) || !hasText(lesson.title, 200) || !hasText(lesson.summary, 1000)) return false;
  if (lesson.questions !== undefined && (!Array.isArray(lesson.questions) || !lesson.questions.every(validQuestion))) return false;

  if (skillId === 'grammar') {
    return stringList(lesson.rule)
      && Array.isArray(lesson.examples) && lesson.examples.length > 0
      && lesson.examples.every((example) => hasText(example?.text) && hasText(example?.note));
  }
  if (skillId === 'vocabulary') {
    return Array.isArray(lesson.words) && lesson.words.length > 0
      && lesson.words.every((word) => hasText(word?.word, 200) && hasText(word?.definition, 1000) && hasText(word?.example, 2000));
  }
  if (skillId === 'reading') {
    return hasText(lesson.passage?.title, 200) && stringList(lesson.passage?.paragraphs, { max: 30 });
  }
  if (skillId === 'listening') {
    return hasText(lesson.listening?.text, 10000) && hasText(lesson.listening?.lang, 20);
  }
  if (skillId === 'speaking') {
    return stringList(lesson.phrases)
      && Array.isArray(lesson.prompts) && lesson.prompts.length > 0
      && lesson.prompts.every((prompt) => hasText(prompt?.id, 100) && hasText(prompt?.text, 2000));
  }
  const writing = lesson.writing;
  return hasText(writing?.promptId, 100) && hasText(writing?.topic, 2000)
    && Number.isInteger(writing?.minWords) && writing.minWords > 0
    && Number.isInteger(writing?.maxWords) && writing.maxWords >= writing.minWords && writing.maxWords <= 1000
    && stringList(writing?.structure) && stringList(writing?.phrases);
}

export function validatePracticeContent(skillId, content) {
  if (!SKILLS.has(skillId) || !content || content.skill !== skillId
    || !Array.isArray(content.lessons) || content.lessons.length > 200) return false;
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > 700_000) return false;
  const lessonIds = new Set();
  const questionIds = new Set();
  for (const lesson of content.lessons) {
    if (!validLesson(skillId, lesson) || lessonIds.has(lesson.id)) return false;
    lessonIds.add(lesson.id);
    for (const question of lesson.questions ?? []) {
      if (questionIds.has(question.id)) return false;
      questionIds.add(question.id);
    }
  }
  return true;
}

export async function instructorSavePracticeContentCore(deps, { actor, data }) {
  if (!validatePracticeContent(data?.skillId, data?.content)) {
    throw new HttpsError('invalid-argument', 'Check the curriculum structure and try again.');
  }
  const { db, FieldValue, audit } = deps;
  const { skillId, content } = data;
  await db.collection('practiceContent').doc(skillId).set({
    skill: skillId,
    lessons: content.lessons,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  });
  await audit({
    actorId: actor.uid,
    action: 'practice_content.update',
    resource: { type: 'practice-content', id: skillId },
    metadata: { lessonCount: content.lessons.length },
  });
  return { skillId, lessonCount: content.lessons.length };
}

export const instructorSavePracticeContent = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['instructor'], deps);
  return instructorSavePracticeContentCore(deps, { actor, data: request.data });
});