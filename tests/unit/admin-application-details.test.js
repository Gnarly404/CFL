// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applicationDetails } from '@/admin/application-details.js';

describe('admin application details', () => {
  it('shows the new registration fields only after the staff member expands the row', () => {
    const node = applicationDetails({
      applicant: {
        firstName: 'Amina', middleName: 'Nia', surname: 'Otieno', dateOfBirth: '2006-04-12', gender: 'female', nationality: 'Kenyan',
        identityDocument: { type: 'national_id', number: '12345678' }, email: 'amina@example.test', phoneNumber: '+254700000001',
        residentialAddress: '12 Valley Road', countryOfResidence: 'Kenya',
        academicBackground: { highestQualification: 'secondary', institutionAttended: 'CFL Academy', completionYear: 2024 },
      },
      contactPerson: { name: 'Nia Otieno', relationship: 'parent', phoneNumber: '+254700000002' },
      programmeId: 'english-intake', consent: { version: '2026-10-v2', guardianConsent: true },
    });
    document.body.append(node);
    expect(node.open).toBe(false);
    expect(node.textContent).toContain('Amina Nia Otieno');
    expect(node.textContent).toContain('National ID');
    expect(node.textContent).toContain('12345678');
    expect(node.textContent).toContain('CFL Academy');
    expect(node.textContent).toContain('Nia Otieno');
    expect(node.textContent).toContain('Confirmed');
  });

  it('falls back to legacy guardian-shaped applications', () => {
    const node = applicationDetails({
      applicant: { firstName: 'Amina', surname: 'Otieno' },
      guardian: { name: 'Nia Otieno', relationship: 'parent', phoneNumber: '+254700000002', emergencyContact: 'Peter Otieno' },
    });
    expect(node.textContent).toContain('Nia Otieno');
    expect(node.textContent).toContain('Peter Otieno');
  });
});