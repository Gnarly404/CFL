import { PROGRAMME_DEFAULT_DETAILS, PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS, validateProgramme } from '@/utils/programme-schema.js';
import { el, setBusy, setFieldError } from '@/utils/dom.js';
import { deleteProgramme, listCatalog, saveProgramme } from '@/services/programme-service.js';

const GROUP_LABEL = (group) => PROGRAMME_GROUP_LABELS[group] ?? group;

/**
 * Admin catalogue: create and edit programmes. Instructors cannot reach this; they only teach
 * programmes an administrator has assigned them.
 */
export function initProgrammes({ root = document, say, onChange, onLoad } = {}) {
  const body = root.querySelector('#programmesBody');
  const form = root.querySelector('#programmeForm');
  if (!body || !form) return { load() {} };

  const field = (id) => form.querySelector(`#${id}`);
  const empty = (text) => el('tr', {}, el('td', { colspan: 5, class: 'empty' }, text));
  let editingId = '';

  function fill(programme = null) {
    editingId = programme?.id ?? '';
    field('programmeId').value = programme?.id ?? '';
    field('programmeId').disabled = Boolean(programme);
    field('programmeName').value = programme?.name ?? '';
    field('programmeCategory').value = programme?.category ?? '';
    field('programmeGroup').value = programme?.group ?? 'beginner';
    field('programmeDuration').value = programme?.duration ?? '';
    field('programmeSkills').value = programme?.details?.skills ?? PROGRAMME_DEFAULT_DETAILS.skills;
    field('programmeEligibility').value = programme?.details?.eligibility ?? PROGRAMME_DEFAULT_DETAILS.eligibility;
    field('programmeFeeLocal').value = programme?.details?.applicationFeeLocal ?? PROGRAMME_DEFAULT_DETAILS.applicationFeeLocal;
    field('programmeFeeForeign').value = programme?.details?.applicationFeeForeign ?? PROGRAMME_DEFAULT_DETAILS.applicationFeeForeign;
    field('programmeActive').checked = programme ? programme.active !== false : true;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = programme ? 'Save changes' : 'Add programme';
    ['programmeId', 'programmeName', 'programmeCategory', 'programmeGroup', 'programmeDuration', 'programmeSkills', 'programmeEligibility', 'programmeFeeLocal', 'programmeFeeForeign'].forEach((id) => setFieldError(field(id), null));
  }

  async function load() {
    body.replaceChildren(empty('Loading programmes…'));
    let rows;
    try {
      rows = await listCatalog();
    } catch (error) {
      body.replaceChildren(empty('Programmes could not be loaded.'));
      say?.(error.message || 'Programmes could not be loaded.', 'error');
      return;
    }
    onLoad?.(rows);
    if (!rows.length) {
      body.replaceChildren(empty('No programmes yet. Add one with the form.'));
      return;
    }
    body.replaceChildren(...rows.map((programme) => {
      const edit = el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-secondary',
        onclick: () => {
          fill(programme);
          form.scrollIntoView({ block: 'nearest' });
        },
      }, 'Edit');
      const remove = el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-danger',
        onclick: async (event) => {
          if (!window.confirm(`Delete ${programme.name}? It will be removed from the public programmes page.`)) return;
          const button = event.currentTarget;
          setBusy(button, true, 'Deleting…');
          try {
            await deleteProgramme({ id: programme.id });
            if (editingId === programme.id) fill(null);
            say?.(`${programme.name} deleted.`, 'success');
            await load();
            await onChange?.();
          } catch (error) {
            say?.(error.message || 'The programme could not be deleted.', 'error');
          } finally {
            setBusy(button, false);
          }
        },
      }, 'Delete');
      return el('tr', {},
        el('td', {}, el('strong', {}, programme.name), el('br'), el('small', {}, programme.id)),
        el('td', {}, GROUP_LABEL(programme.group)),
        el('td', {}, programme.duration || '—'),
        el('td', {}, programme.active ? 'Published' : 'Hidden'),
        el('td', { class: 'actions' }, edit, remove));
    }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      id: editingId || field('programmeId').value,
      name: field('programmeName').value,
      category: field('programmeCategory').value,
      group: field('programmeGroup').value,
      duration: field('programmeDuration').value,
      active: field('programmeActive').checked,
      details: {
        skills: field('programmeSkills').value,
        eligibility: field('programmeEligibility').value,
        applicationFeeLocal: field('programmeFeeLocal').value,
        applicationFeeForeign: field('programmeFeeForeign').value,
      },
    };
    const { ok, errors } = validateProgramme(payload);
    setFieldError(field('programmeId'), errors.id);
    setFieldError(field('programmeName'), errors.name);
    setFieldError(field('programmeCategory'), errors.category);
    setFieldError(field('programmeGroup'), errors.group);
    setFieldError(field('programmeDuration'), errors.duration);
    setFieldError(field('programmeSkills'), errors.skills);
    setFieldError(field('programmeEligibility'), errors.eligibility);
    setFieldError(field('programmeFeeLocal'), errors.applicationFeeLocal);
    setFieldError(field('programmeFeeForeign'), errors.applicationFeeForeign);
    if (!ok) return;

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving…');
    try {
      const result = await saveProgramme(payload);
      say?.(result?.created ? `${payload.name} added.` : `${payload.name} updated.`, 'success');
      fill(null);
      await load();
      await onChange?.();
    } catch (error) {
      say?.(error.message || 'That did not work. Try again.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  form.querySelector('#programmeReset')?.addEventListener('click', () => fill(null));

  const groupSelect = field('programmeGroup');
  if (groupSelect && groupSelect.options.length <= 1) {
    groupSelect.replaceChildren(...PROGRAMME_GROUPS.map((group) => el('option', { value: group }, GROUP_LABEL(group))));
  }

  fill(null);
  return { load };
}
