import programmes from '../../data/programmes.json';

const DETAILS = {
  Skills: 'Grammar, Writing, Speech, Listening, Reading & Vocabulary',
  Eligibility: 'High School Certificate',
  'Application fee (local)': 'KES 1,000',
  'Application fee (foreign)': 'KES 0',
};

const grid = document.getElementById('programmeGrid');
const dialog = document.getElementById('programmeDialog');
const chips = document.querySelectorAll('.pc-chip');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function card(p) {
  const article = el('article', 'pc-card');
  article.append(el('p', 'pc-kicker', p.category), el('h2', '', p.name), el('p', 'pc-meta', `Duration: ${p.duration}`));
  const btn = el('button', 'pc-btn', 'View programme');
  btn.type = 'button';
  btn.setAttribute('aria-label', `View programme: ${p.name}`);
  btn.addEventListener('click', () => openDetails(p));
  article.append(btn);
  return article;
}

function openDetails(p) {
  document.getElementById('pdCategory').textContent = p.category;
  document.getElementById('pdTitle').textContent = p.name;
  const facts = document.getElementById('pdFacts');
  facts.replaceChildren();
  const rows = { Duration: p.duration, ...DETAILS };
  for (const [k, v] of Object.entries(rows)) facts.append(el('dt', '', k), el('dd', '', v));
  dialog.showModal();
}

function render(group) {
  const list = group === 'all' ? programmes : programmes.filter((p) => p.group === group);
  grid.replaceChildren(...(list.length ? list.map(card) : [el('p', 'pc-empty', 'No programmes match this level.')]));
}

chips.forEach((chip) =>
  chip.addEventListener('click', () => {
    chips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    render(chip.dataset.group);
  }),
);

dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
render('all');
