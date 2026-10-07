/** Pure practice logic: marking, scoring and progress. No browser or Firebase code, so it is easy to test. */

export function scoreAttempt(questions, answers) {
  const mistakes = [];
  let correct = 0;
  questions.forEach((question, index) => {
    if (answers[index] === question.answer) correct += 1;
    else mistakes.push(question.id);
  });
  const total = questions.length;
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0, mistakes };
}

export function lessonStatus(progress, lessonId) {
  return progress?.[lessonId]?.status === 'completed' ? 'completed' : 'new';
}

export function skillPercent(lessons, progress) {
  if (!lessons.length) return 0;
  const done = lessons.filter((lesson) => lessonStatus(progress, lesson.id) === 'completed').length;
  return Math.round((done / lessons.length) * 100);
}

/** The first lesson not yet completed, or null when the skill is finished. */
export function nextLesson(lessons, progress) {
  return lessons.find((lesson) => lessonStatus(progress, lesson.id) !== 'completed') ?? null;
}

/** Content checks, used by tests so a mistake in a lesson file fails the build. */
export function validateLesson(lesson) {
  const problems = [];
  if (!lesson.id || !lesson.title) problems.push('lesson needs id and title');
  if (!Array.isArray(lesson.rule) || !lesson.rule.length) problems.push(`${lesson.id}: missing rule`);
  if (!Array.isArray(lesson.examples) || !lesson.examples.length) problems.push(`${lesson.id}: missing examples`);
  if (!Array.isArray(lesson.questions) || !lesson.questions.length) problems.push(`${lesson.id}: missing questions`);
  for (const q of lesson.questions ?? []) {
    if (!Array.isArray(q.options) || q.options.length < 2) problems.push(`${q.id}: needs at least two options`);
    else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) problems.push(`${q.id}: answer index out of range`);
    if (new Set(q.options).size !== q.options?.length) problems.push(`${q.id}: duplicate options`);
    if (!q.why) problems.push(`${q.id}: missing explanation`);
  }
  return problems;
}
