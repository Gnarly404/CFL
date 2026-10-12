import { describe, expect, it } from 'vitest';
import { enrollmentStatusLabel, legalName, missingRequiredProfileFields } from '../../src/js/student/dashboard.js';

describe('student dashboard profile data', () => {
  it('reports only required admission fields that are actually missing', () => {
    const missing = missingRequiredProfileFields({
      firstName: 'Amina', surname: 'Otieno', dateOfBirth: '2004-05-12', nationality: 'kenyan', phoneNumber: '0712345678',
      guardian: { name: 'Jane Otieno', relationship: 'parent', phoneNumber: '0711222333', emergencyContact: 'Jane Otieno' },
    });
    expect(missing).toEqual([]);
    expect(missingRequiredProfileFields({ firstName: 'Amina' })).toContain('Guardian phone');
  });

  it('does not treat optional middle or preferred names as missing', () => {
    expect(missingRequiredProfileFields({ middleName: '', preferredName: '' })).not.toContain('Middle name');
    expect(missingRequiredProfileFields({ preferredName: '' }).some((field) => field.toLowerCase().includes('preferred'))).toBe(false);
  });

  it('builds legal names and readable enrollment statuses', () => {
    expect(legalName({ firstName: 'Amina', middleName: 'Wanjiku', surname: 'Otieno' })).toBe('Amina Wanjiku Otieno');
    expect(legalName({}, 'Amina Otieno')).toBe('Amina Otieno');
    expect(enrollmentStatusLabel('pending_start')).toBe('Starting soon');
  });
});