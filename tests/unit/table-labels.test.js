// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { initTableLabels, initialsOf, labelRows, toneOf } from '@/ui/table-labels.js';

const table = (attrs = '') => `
  <table data-stack ${attrs}><thead><tr><th>Reference</th><th>Applicant</th><th>Submitted</th></tr></thead>
  <tbody><tr><td>CFL-1</td><td><strong>Wanjiku Kamau</strong><br><small>w@example.com</small>
    <details class="application-details"><summary>View</summary><dl class="application-facts"><dt>Gender</dt><dd>female</dd></dl></details></td><td>9 Oct</td></tr>
  <tr><td class="empty" colspan="3">Nothing yet</td></tr></tbody></table>`;

describe('table labels', () => {
  beforeEach(() => { document.body.innerHTML = table('data-avatar-col="1" data-detail-rows'); });

  it('labels every cell from its column heading, but not the empty-state cell', () => {
    labelRows(document.querySelector('table'));
    const cells = [...document.querySelectorAll('tbody tr:first-child > td')];
    expect(cells.map((cell) => cell.dataset.label)).toEqual(['Reference', 'Applicant', 'Submitted']);
    expect(document.querySelector('td.empty').hasAttribute('data-label')).toBe(false);
  });

  it('turns the person column into initials plus name and detail, keeping the details control inside', () => {
    labelRows(document.querySelector('table'));
    const person = document.querySelector('.person');
    expect(person.querySelector('.avatar').textContent).toBe('WK');
    expect(person.querySelector('.avatar').getAttribute('aria-hidden')).toBe('true');
    expect(person.querySelector('.person-text strong').textContent).toBe('Wanjiku Kamau');
    expect(person.querySelector('.person-text details')).not.toBeNull();
    labelRows(document.querySelector('table')); // running again must not wrap twice
    expect(document.querySelectorAll('.person')).toHaveLength(1);
  });

  it('opens an application into a full-width row and puts the facts back when it closes', () => {
    labelRows(document.querySelector('table'));
    const row = document.querySelector('tbody tr');
    const extra = row.nextElementSibling;
    const details = row.querySelector('details');
    expect(extra.matches('tr.detail-row[data-detail]')).toBe(true);
    expect(extra.hidden).toBe(true);
    expect(extra.firstElementChild.colSpan).toBe(3);

    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(extra.hidden).toBe(false);
    expect(extra.querySelector('.application-facts')).not.toBeNull();
    expect(row.dataset.open).toBe('true');

    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(extra.hidden).toBe(true);
    expect(details.querySelector('.application-facts')).not.toBeNull();
    expect(row.hasAttribute('data-open')).toBe(false);
  });

  it('labels rows that a script adds later', async () => {
    document.body.innerHTML = table();
    initTableLabels();
    const body = document.querySelector('tbody');
    const added = document.createElement('tr');
    added.innerHTML = '<td>CFL-2</td><td>B</td><td>1 Nov</td>';
    body.append(added);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(added.cells[2].dataset.label).toBe('Submitted');
  });

  it('makes initials and a stable tint from a name', () => {
    expect(initialsOf('Amina Wanjiru')).toBe('AW');
    expect(initialsOf('Chen')).toBe('C');
    expect(initialsOf('  ')).toBe('•');
    expect(initialsOf('Élodie Martin-Dupont')).toBe('ÉM');
    expect(toneOf('Amina Wanjiru')).toBe(toneOf('Amina Wanjiru'));
    expect(toneOf('x')).toBeGreaterThanOrEqual(1);
    expect(toneOf('x')).toBeLessThanOrEqual(5);
  });
});
