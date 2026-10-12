import { describe, expect, it } from 'vitest';
import { applicantIsUnder18, STEP_FIELDS, validateApplication } from '@/utils/application-schema.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const valid = {
  firstName: 'Wanjiku', middleName: '', surname: 'Kamau', dateOfBirth: '2012-05-14', gender: 'female',
  email: '  Parent@Example.com ', phoneNumber: '0712 345 678', nationality: 'Kenyan',
  identificationType: 'national_id', identificationNumber: '1234 5678',
  residentialAddress: '12 Valley Road, Nairobi', countryOfResidence: 'Kenya',
  contactName: 'Grace Kamau', contactRelationship: 'parent', contactPhone: '+254 722 000 111', guardianConsent: true,
  highestQualification: 'secondary', institutionAttended: 'Nairobi School', completionYear: '2020',
  programmeId: 'english-intake', consent: true,
};

describe('validateApplication', () => {
  it('accepts and normalises a complete application', () => {
    const { ok, value, errors } = validateApplication(valid, { now: NOW });
    expect(errors).toEqual({});
    expect(ok).toBe(true);
    expect(value).toMatchObject({
      email: 'parent@example.com', phoneNumber: '+254712345678', contactPhone: '+254722000111',
      identificationNumber: '1234 5678', completionYear: 2020, programmeId: 'english-intake', consent: true, guardianConsent: true,
    });
  });

  it('reports every missing required field and nothing for optional ones', () => {
    const { ok, errors } = validateApplication({}, { now: NOW });
    expect(ok).toBe(false);
    expect(Object.keys(errors).sort()).toEqual([
      'completionYear', 'consent', 'contactName', 'contactPhone', 'contactRelationship', 'countryOfResidence',
      'dateOfBirth', 'email', 'firstName', 'gender', 'highestQualification', 'identificationNumber',
      'identificationType', 'institutionAttended', 'nationality', 'phoneNumber', 'programmeId', 'residentialAddress', 'surname',
    ]);
  });

  it('requires consent to be exactly true', () => {
    expect(validateApplication({ ...valid, consent: 'true' }, { now: NOW }).errors.consent).toBeDefined();
    expect(validateApplication({ ...valid, consent: false }, { now: NOW }).errors.consent).toBeDefined();
  });

  it('rejects unknown option values', () => {
    const { errors } = validateApplication({
      ...valid, gender: 'x', contactRelationship: 'cousin', identificationType: 'driver_license', highestQualification: 'x', nationality: '123',
    }, { now: NOW });
    expect(Object.keys(errors).sort()).toEqual(['contactRelationship', 'gender', 'highestQualification', 'identificationType', 'nationality']);
  });

  it('requires a valid requested programme', () => {
    expect(validateApplication({ ...valid, programmeId: 'general-english' }, { now: NOW }).value.programmeId).toBe('general-english');
    expect(validateApplication({ ...valid, programmeId: '' }, { now: NOW }).errors.programmeId).toBeDefined();
    expect(validateApplication({ ...valid, programmeId: 'Bad Id!' }, { now: NOW }).errors.programmeId).toBeDefined();
  });

  it('requires parent or guardian contact and consent for applicants under 18', () => {
    expect(applicantIsUnder18('2008-10-07', NOW)).toBe(true);
    expect(applicantIsUnder18('2008-10-06', NOW)).toBe(false);
    const { errors } = validateApplication({ ...valid, contactRelationship: 'sibling', guardianConsent: false }, { now: NOW });
    expect(errors.contactRelationship).toMatch(/parent or legal guardian/i);
    expect(errors.guardianConsent).toMatch(/required/i);
  });

  it('does not require guardian consent for adults or school details when no qualification is declared', () => {
    const { ok, errors, value } = validateApplication({
      ...valid, dateOfBirth: '2000-05-14', contactRelationship: 'sibling', guardianConsent: false,
      highestQualification: 'none', institutionAttended: '', completionYear: '',
    }, { now: NOW });
    expect(ok).toBe(true);
    expect(errors).toEqual({});
    expect(value).not.toHaveProperty('guardianConsent');
    expect(value).toMatchObject({ institutionAttended: '', completionYear: null });
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
