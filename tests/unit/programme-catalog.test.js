import { describe, expect, it } from 'vitest';
import fallback from '../../src/data/programmes.json';
import { mergeCatalog, validateProgramme } from '../../src/js/utils/programme-schema.js';

describe('programme catalogue', () => {
  it('keeps preset cards when saved records are empty', () => {
    expect(mergeCatalog([], fallback)).toHaveLength(fallback.length);
  });

  it('merges saved details over preset card details and omits deleted ids', () => {
    const result = mergeCatalog([
      { id: fallback[0].id, name: 'Updated intake', details: { skills: 'Conversation' } },
    ], fallback, [fallback[1].id]);
    expect(result).toHaveLength(fallback.length - 1);
    expect(result.find((programme) => programme.id === fallback[0].id)).toMatchObject({
      name: 'Updated intake',
      details: { skills: 'Conversation', eligibility: 'High School Certificate' },
    });
    expect(result.some((programme) => programme.id === fallback[1].id)).toBe(false);
  });

  it('validates and returns editable card details', () => {
    const result = validateProgramme({
      id: 'custom-course', name: 'Custom Course', category: 'English', group: 'beginner', duration: '3 months',
      details: { skills: 'Speaking', eligibility: 'Any level', applicationFeeLocal: 'KES 500', applicationFeeForeign: 'KES 5' },
    });
    expect(result.ok).toBe(true);
    expect(result.value.details.skills).toBe('Speaking');
    expect(validateProgramme({
      id: 'custom-course', name: 'Custom Course', category: 'English', group: 'beginner', duration: '3 months',
      details: { skills: 'x'.repeat(241) },
    }).ok).toBe(false);
  });
});