function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Where a programme sits on the way up. The intake comes first and has no level of its own. */
const LEVELS = {
  intake: { label: 'Intake', pips: 0 },
  beginner: { label: 'Level 1 of 3', pips: 1 },
  intermediate: { label: 'Level 2 of 3', pips: 2 },
  advanced: { label: 'Level 3 of 3', pips: 3 },
};
const GROUP_LABEL = {
  all: 'All levels',
  intake: 'Intake',
  beginner: 'Elementary-Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
const SHOWN_SKILLS = 3;

/** "English Language Programme (Advanced)" becomes the programme and its level; anything else stays whole. */
export function splitName(name) {
  const match = /^(.*?)\s*\((.+)\)\s*$/.exec(String(name ?? ''));
  return match && match[1] ? { programme: match[1], level: match[2] } : { programme: '', level: String(name ?? '') };
}

/** "Grammar, Writing & Speech" becomes ['Grammar', 'Writing', 'Speech']. */
export function splitSkills(text) {
  return String(text ?? '').split(/\s*,\s*|\s+&\s+/).map((skill) => skill.trim()).filter(Boolean);
}

function levelMeter(group) {
  const level = LEVELS[group];
  if (!level) return null;
  const meter = el('span', 'pc-level');
  meter.dataset.group = group;
  if (level.pips) {
    const pips = el('span', 'pc-pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let index = 1; index <= 3; index += 1) {
      const pip = el('i');
      if (index <= level.pips) pip.dataset.on = '';
      pips.append(pip);
    }
    meter.append(pips);
  }
  meter.append(el('span', 'pc-level-label', level.label));
  return meter;
}

function card(p, openDetails) {
  const article = el('article', 'pc-card');
  article.dataset.group = p.group ?? '';
  const { programme, level } = splitName(p.name);

  const top = el('div', 'pc-card-top');
  top.append(el('p', 'pc-kicker', p.category));
  const meter = levelMeter(p.group);
  if (meter) top.append(meter);

  const title = el('h2', 'pc-title');
  if (programme) title.append(el('span', 'pc-title-sub', programme), ' ', el('span', 'pc-title-main', level));
  else title.textContent = p.name;

  const stats = el('dl', 'pc-stats');
  const stat = (label, value) => {
    if (!value) return;
    const row = el('div');
    row.append(el('dt', '', label), el('dd', '', value));
    stats.append(row);
  };
  stat('Duration', p.duration);
  stat('Entry', p.details?.eligibility);

  article.append(top, title, stats);

  const skills = splitSkills(p.details?.skills);
  if (skills.length) {
    const tags = el('ul', 'pc-tags');
    tags.setAttribute('aria-label', 'Skills covered');
    for (const skill of skills.slice(0, SHOWN_SKILLS)) tags.append(el('li', '', skill));
    if (skills.length > SHOWN_SKILLS) tags.append(el('li', 'pc-tag-more', `+${skills.length - SHOWN_SKILLS} more`));
    article.append(tags);
  }

  const btn = el('button', 'pc-btn', 'View programme');
  btn.type = 'button';
  btn.setAttribute('aria-label', `View programme: ${p.name}`);
  btn.append(el('span', 'pc-arrow', '→'));
  btn.lastChild.setAttribute('aria-hidden', 'true');
  btn.addEventListener('click', () => openDetails(p));
  article.append(btn);
  return article;
}

/** Renders the public programme cards. `load` returns the catalogue (Firestore, with a static fallback). */
export function initProgrammesPage({ root = document, load } = {}) {
  const grid = root.getElementById?.('programmeGrid') ?? root.querySelector('#programmeGrid');
  const dialog = root.getElementById?.('programmeDialog') ?? root.querySelector('#programmeDialog');
  const chips = root.querySelectorAll('.pc-chip');
  const status = root.querySelector('#pcStatus');
  if (!grid) return { render() {} };

  let programmes = [];
  let activeGroup = 'all';

  function openDetails(p) {
    if (!dialog) return;
    const category = root.querySelector('#pdCategory');
    const title = root.querySelector('#pdTitle');
    const facts = root.querySelector('#pdFacts');
    const levelSlot = root.querySelector('#pdLevel');
    const apply = root.querySelector('#pdApply');
    if (category) category.textContent = p.category;
    if (title) title.textContent = p.name;
    if (levelSlot) {
      const meter = levelMeter(p.group);
      levelSlot.replaceChildren(...(meter ? [meter] : []));
    }
    // Arrive on the application with this programme already chosen.
    if (apply) apply.href = p.id ? `/register?programme=${encodeURIComponent(p.id)}` : '/register';
    if (facts) {
      facts.replaceChildren();
      const rows = [
        ['Duration', p.duration],
        ['Skills', p.details?.skills, true],
        ['Eligibility', p.details?.eligibility, true],
        ['Application fee (local)', p.details?.applicationFeeLocal],
        ['Application fee (foreign)', p.details?.applicationFeeForeign],
      ];
      for (const [label, value, wide] of rows) {
        if (!value) continue;
        const row = el('div', wide ? 'is-wide' : '');
        row.append(el('dt', '', label), el('dd', '', value));
        facts.append(row);
      }
    }
    dialog.showModal?.();
  }

  function announce(list, group) {
    if (!status) return;
    const total = programmes.length;
    const noun = (count) => `${count} ${count === 1 ? 'programme' : 'programmes'}`;
    status.textContent = group === 'all'
      ? `Showing all ${noun(total)}`
      : `Showing ${list.length} of ${noun(total)} · ${GROUP_LABEL[group] ?? group}`;
  }

  function showAll() {
    [...chips].find((chip) => chip.dataset.group === 'all')?.click();
  }

  function emptyState() {
    const box = el('div', 'pc-empty');
    box.append(el('p', '', 'No programmes match this level.'));
    const reset = el('button', 'pc-btn', 'Show all programmes');
    reset.type = 'button';
    reset.addEventListener('click', showAll);
    box.append(reset);
    return box;
  }

  function render(group = 'all') {
    activeGroup = group;
    const list = group === 'all' ? programmes : programmes.filter((p) => p.group === group);
    grid.replaceChildren(...(list.length ? list.map((p) => card(p, openDetails)) : [emptyState()]));
    announce(list, group);
  }

  /** The number beside each level, so it is clear before clicking whether anything is there. */
  function countChips() {
    chips.forEach((chip) => {
      const badge = chip.querySelector('.pc-count');
      if (!badge) return;
      const group = chip.dataset.group;
      badge.textContent = String(group === 'all' ? programmes.length : programmes.filter((p) => p.group === group).length);
    });
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

  dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  async function start() {
    programmes = (await load()) ?? [];
    countChips();
    render(activeGroup);
  }

  return { start, render };
}
