import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { buildDeck, deckCounts, reviewCard } from '@/practice/flashcards.js';
import { startTracker } from '@/practice/session-tracker.js';
import { loadWordProgress, saveWordProgress } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';
import { speak, speechSupported } from '@/ui/speech.js';

mountPortalShell('practice');
const session = await guardPage({ roles: ['student'] });
const uid = session.user.uid;
const stage = document.getElementById('stage');
const show = (...nodes) => { stage.replaceChildren(...nodes); document.getElementById('stageHeading')?.focus(); };
const back = () => h('a', { class: 'btn', href: ROUTES.practice }, 'Back to English Practice');

let progress;
try {
  progress = await loadWordProgress(uid);
} catch (error) {
  console.warn('Could not load word progress', error?.code ?? error);
  show(h('h1', { id: 'stageHeading', tabindex: '-1' }, 'Flashcards'),
    h('p', { class: 'form-note', role: 'alert' }, 'Your saved words could not be loaded, so flashcards are turned off to protect your progress. Check your connection and reload.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'reload' }, 'Reload'), back()));
  document.getElementById('reload').addEventListener('click', () => window.location.reload());
  progress = null;
}

if (progress) run();

function run() {
  const tracker = startTracker({ uid, skill: 'vocabulary', lessonId: 'flashcards', kind: 'flashcards' });
  let deck = [];
  let index = 0;
  let flipped = false;
  let answers = [];
  let saveNote = '';
  let step = 'intro';

  function intro() {
    const counts = deckCounts(progress);
    deck = buildDeck(progress);
    if (!deck.length) {
      show(h('h1', { id: 'stageHeading', tabindex: '-1' }, 'Flashcards'),
        h('p', {}, 'Nothing to review right now. Words you marked "Need practice" come back after a day.'),
        h('p', { class: 'muted' }, `${counts.mastered} of ${counts.total} words mastered.`), h('div', { class: 'actions' }, back()));
      return;
    }
    show(h('h1', { id: 'stageHeading', tabindex: '-1' }, 'Flashcards'),
      h('p', { class: 'muted' }, 'See the word, try to remember what it means, then flip the card. Be honest: words you are unsure about come back sooner.'),
      h('p', {}, `${deck.length} words today · ${counts.due} due for review · ${counts.fresh} new · ${counts.mastered} of ${counts.total} mastered`),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'go' }, 'Start flashcards'), back()));
    document.getElementById('go').addEventListener('click', () => { step = 'card'; render(); });
  }

  function card() {
    const word = deck[index];
    const front = h('div', { class: 'flashcard' },
      h('h1', { id: 'stageHeading', tabindex: '-1' }, word.word),
      speechSupported() ? h('button', { type: 'button', class: 'link-btn', 'aria-label': `Listen to ${word.word}` }, 'Listen') : '');
    front.querySelector('button')?.addEventListener('click', () => speak(word.word));
    const back1 = flipped ? h('div', { class: 'feedback', role: 'status' }, h('strong', {}, 'Meaning'), word.definition, h('div', { class: 'muted' }, `Example: ${word.example}`)) : '';
    const actions = flipped
      ? h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', id: 'know' }, 'I know this'),
        h('button', { class: 'btn', type: 'button', id: 'need' }, 'Need practice'))
      : h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'flip' }, 'Show meaning'));
    show(h('p', { class: 'step-meta' }, `Word ${index + 1} of ${deck.length}`), front, back1, actions);
    document.getElementById('flip')?.addEventListener('click', () => { flipped = true; render(); document.getElementById('know')?.focus(); });
    document.getElementById('know')?.addEventListener('click', () => answer(true));
    document.getElementById('need')?.addEventListener('click', () => answer(false));
  }

  function answer(known) {
    answers.push({ word: deck[index], known });
    flipped = false;
    if (index < deck.length - 1) { index += 1; render(); return; }
    step = 'results';
    persist();
  }

  async function persist() {
    saveNote = 'Saving your progress…';
    render();
    const now = new Date();
    const next = { ...progress };
    for (const { word, known } of answers) next[word.key] = reviewCard(next[word.key], known, now);
    try {
      await saveWordProgress(uid, next);
      progress = next;
      await tracker.complete();
      saveNote = 'Progress saved.';
    } catch (error) {
      console.warn('Could not save word progress', error?.code ?? error);
      saveNote = 'Your progress could not be saved.';
    }
    render();
  }

  function results() {
    const known = answers.filter((a) => a.known).length;
    const need = answers.filter((a) => !a.known);
    show(h('p', { class: 'step-meta' }, 'Results'),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, `${known} of ${answers.length} words known`),
      h('p', { class: 'muted', role: 'status' }, saveNote),
      need.length ? h('div', {}, h('h2', {}, 'Words to practise'), h('ul', { class: 'review-list' }, ...need.map(({ word }) => h('li', {}, h('strong', {}, word.word), ` — ${word.definition}`, h('div', { class: 'muted' }, word.example))))) : h('p', {}, 'You knew every word.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', id: 'again' }, 'More flashcards'), back(),
        saveNote === 'Your progress could not be saved.' ? h('button', { class: 'btn', type: 'button', id: 'retry' }, 'Try saving again') : ''));
    document.getElementById('again').addEventListener('click', () => { answers = []; index = 0; step = 'intro'; tracker.reset(); render(); });
    document.getElementById('retry')?.addEventListener('click', persist);
  }

  function render() { if (step === 'intro') intro(); else if (step === 'card') card(); else results(); }
  render();
}
