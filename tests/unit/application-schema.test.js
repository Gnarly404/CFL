import { describe, expect, it } from 'vitest';
import { STEP_FIELDS, validateApplication } from '@/utils/application-schema.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const valid = {
  firstName: 'Wanjiku', middleName: '', surname: 'Kamau', dateOfBirth: '2012-05-14', gender: 'female',
  email: '  Parent@Example.com ', phoneNumber: '0712 345 678', nationality: 'kenyan',
  guardianName: 'Grace Kamau', relationship: 'parent', guardianPhone: '+254 722 000 111',
  emergencyContact: 'Peter Kamau', consent: true,
};

describe('validateApplication', () => {
  it('accepts and normalises a complete application', () => {
    const { ok, value, errors } = validateApplication(valid, { now: NOW });
    expect(errors).toEqual({});
    expect(ok).toBe(true);
    expect(value).toMatchObject({
      email: 'parent@example.com', phoneNumber: '+254712345678', guardianPhone: '+254722000111', programmeId: null, consent: true,
    });
  });

  it('reports every missing required field and nothing for optional ones', () => {
    const { ok, errors } = validateApplication({}, { now: NOW });
    expect(ok).toBe(false);
    expect(Object.keys(errors).sort()).toEqual([
      'consent', 'dateOfBirth', 'email', 'emergencyContact', 'firstName', 'gender', 'guardianName',
      'guardianPhone', 'nationality', 'phoneNumber', 'relationship', 'surname',
    ]);
  });

  it('requires consent to be exactly true', () => {
    expect(validateApplication({ ...valid, consent: 'true' }, { now: NOW }).errors.consent).toBeDefined();
    expect(validateApplication({ ...valid, consent: false }, { now: NOW }).errors.consent).toBeDefined();
  });

  it('rejects unknown option values', () => {
    const { errors } = validateApplication({ ...valid, gender: 'x', relationship: 'cousin', nationality: 'martian' }, { now: NOW });
    expect(Object.keys(errors).sort()).toEqual(['gender', 'nationality', 'relationship']);
  });

  it('validates the optional programme id', () => {
    expect(validateApplication({ ...valid, programmeId: 'general-english' }, { now: NOW }).value.programmeId).toBe('general-english');
    expect(validateApplication({ ...valid, programmeId: 'Bad Id!' }, { now: NOW }).errors.programmeId).toBeDefined();
  });

  it('never copies unknown fields into the stored value', () => {
    const { value } = validateApplication({ ...valid, role: 'admin', status: 'approved', __proto__: { x: 1 } }, { now: NOW });
    expect(value).not.toHaveProperty('role');
    expect(value).not.toHaveProperty('status');
  });

  it('assigns every validated field to a form step', () => {
    const { value } = validateApplication(valid, { now: NOW });
    const inSteps = new Set(STEP_FIELDS.flat());
    for (const key of Object.keys(value).filter((k) => k !== 'programmeId')) expect(inSteps.has(key)).toBe(true);
  });
});
