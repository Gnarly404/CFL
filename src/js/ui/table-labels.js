/**
 * Tables that scripts fill (the admin console lists). Markup: <table data-stack data-avatar-col="1">.
 *   - every cell gets data-label from its column heading, so on a phone each row becomes a labelled card
 *   - the column named by data-avatar-col is turned into a person: initials in a tinted circle, name and detail beside it
 * With data-detail-rows, a row's <details> opens its facts into a full-width row beneath it (a narrow cell is a poor place to read a form).
 * It watches the table body, so rows added by later reloads are handled too. Nothing here reads or writes data.
 */
const TONES = 5;
const seen = new WeakSet();
const text = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean).map((word) => Array.from(word));
  if (!words.length) return '•';
  const first = words[0][0];
  const last = words.length > 1 ? words.at(-1)[0] : '';
  return `${first}${last}`.toUpperCase();
}

/** The same name always gets the same tint, so people are easy to spot between pages. */
export function toneOf(name) {
  let hash = 0;
  for (const character of String(name)) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return (hash % TONES) + 1;
}

function personCell(cell, name) {
  if (cell.querySelector(':scope > .person')) return;
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.dataset.tone = String(toneOf(name));
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initialsOf(name);
  const details = document.createElement('div');
  details.className = 'person-text';
  details.append(...cell.childNodes);
  const person = document.createElement('div');
  person.className = 'person';
  person.append(avatar, details);
  cell.append(person);
}

function detailRow(row) {
  const details = row.querySelector('details.application-details');
  const facts = details?.querySelector('.application-facts');
  if (!facts || row.hasAttribute('data-detail-bound')) return;
  row.setAttribute('data-detail-bound', '');
  const cell = document.createElement('td');
  cell.colSpan = row.cells.length;
  const extra = document.createElement('tr');
  extra.className = 'detail-row';
  extra.setAttribute('data-detail', '');
  extra.setAttribute('data-in', ''); // the row animation in js/motion/rows.js leaves it alone
  extra.hidden = true;
  extra.append(cell);
  row.after(extra);
  details.addEventListener('toggle', () => {
    if (details.open) {
      cell.append(facts);
      extra.hidden = false;
      row.dataset.open = 'true';
    } else {
      details.append(facts);
      extra.hidden = true;
      delete row.dataset.open;
    }
  });
}

export function labelRows(table) {
  const heads = [...table.querySelectorAll('thead th')].map(text);
  const personColumn = Number.parseInt(table.dataset.avatarCol ?? '', 10);
  for (const body of table.tBodies) {
    for (const row of [...body.rows]) {
      if (row.hasAttribute('data-detail')) continue;
      [...row.cells].forEach((cell, index) => {
        if (!cell.classList.contains('empty') && !cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[index] ?? '');
      });
      if (Number.isInteger(personColumn)) {
        const cell = row.cells[personColumn];
        const name = text(cell?.querySelector('strong'));
        if (cell && name && !cell.classList.contains('empty')) personCell(cell, name);
      }
      if (table.hasAttribute('data-detail-rows')) detailRow(row);
    }
  }
}

export function initTableLabels(root = document) {
  root.querySelectorAll('table[data-stack]').forEach((table) => {
    if (seen.has(table)) return;
    seen.add(table);
    labelRows(table);
    for (const body of table.tBodies) new MutationObserver(() => labelRows(table)).observe(body, { childList: true });
  });
}
