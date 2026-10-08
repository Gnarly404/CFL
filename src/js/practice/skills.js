/** The practice skills. Only skills with `available: true` have content yet. */
export const SKILLS = Object.freeze([
  { id: 'grammar', label: 'Grammar', blurb: 'Rules, examples and short exercises.', available: true },
  { id: 'vocabulary', label: 'Vocabulary', blurb: 'Words you can use today.', available: true },
  { id: 'listening', label: 'Listening', blurb: 'Understand spoken English.', available: true },
  { id: 'speaking', label: 'Speaking', blurb: 'Practise saying it out loud.', available: false },
  { id: 'reading', label: 'Reading', blurb: 'Short passages and questions.', available: true },
  { id: 'writing', label: 'Writing', blurb: 'Put your ideas on the page.', available: false },
]);
