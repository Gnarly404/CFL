function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function card(p, openDetails) {
  const article = el('article', 'pc-card');
  article.append(el('p', 'pc-kicker', p.category), el('h2', '', p.name), el('p', 'pc-meta', `Duration: ${p.duration}`));
  const btn = el('button', 'pc-btn', 'View programme');
  btn.type = 'button';
  btn.setAttribute('aria-label', `View programme: ${p.name}`);
  btn.addEventListener('click', () => openDetails(p));
  article.append(btn);
  return article;
}

/** Renders the public programme cards. `load` returns the catalogue (Firestore, with a static fallback). */
export function initProgrammesPage({ root = document, load } = {}) {
  const grid = root.getElementById?.('programmeGrid') ?? root.querySelector('#programmeGrid');
  const dialog = root.getElementById?.('programmeDialog') ?? root.querySelector('#programmeDialog');
  const chips = root.querySelectorAll('.pc-chip');
  if (!grid) return { render() {} };

  let programmes = [];

  function openDetails(p) {
    if (!dialog) return;
    const category = root.querySelector('#pdCategory');
    const title = root.querySelector('#pdTitle');
    const facts = root.querySelector('#pdFacts');
    if (category) category.textContent = p.category;
    if (title) title.textContent = p.name;
    if (facts) {
      facts.replaceChildren();
      const rows = [
        ['Duration', p.duration],
        ['Skills', p.details?.skills],
        ['Eligibility', p.details?.eligibility],
        ['Application fee (local)', p.details?.applicationFeeLocal],
        ['Application fee (foreign)', p.details?.applicationFeeForeign],
      ];
      for (const [label, value] of rows) {
        if (value) facts.append(el('dt', '', label), el('dd', '', value));
      }
    }
    dialog.showModal?.();
  }

  function render(group = 'all') {
    const list = group === 'all' ? programmes : programmes.filter((p) => p.group === group);
    grid.replaceChildren(...(list.length ? list.map((p) => card(p, openDetails)) : [el('p', 'pc-empty', 'No programmes match this level.')]));
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
    render('all');
  }

  return { start, render };
}
