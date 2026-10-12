import { el } from '@/utils/dom.js';

const QUALIFICATIONS = {
  none: 'No formal qualification yet', primary: 'Primary school certificate', secondary: 'Secondary school certificate',
  certificate: 'Certificate', diploma: 'Diploma', bachelors: "Bachelor's degree", postgraduate: 'Postgraduate qualification', other: 'Other qualification',
};
const IDENTIFICATION_TYPES = { national_id: 'National ID', passport: 'Passport', birth_certificate: 'Birth certificate' };

const valueText = (value) => (value == null || value === '' ? 'Not provided' : String(value));

/** Staff-only application fields shown on demand; the full identification number is deliberately collapsed. */
export function applicationDetails(application) {
  const applicant = application.applicant ?? {};
  const identity = applicant.identityDocument ?? application.identityDocument ?? {};
  const education = applicant.academicBackground ?? {};
  const contact = application.contactPerson ?? application.guardian ?? {};
  const fields = [
    ['Legal name', [applicant.firstName, applicant.middleName, applicant.surname].filter(Boolean).join(' ')],
    ['Date of birth', applicant.dateOfBirth],
    ['Gender', applicant.gender],
    ['Nationality', applicant.nationality],
    ['Identification type', IDENTIFICATION_TYPES[identity.type] ?? identity.type],
    ['Identification number', identity.number],
    ['Email', applicant.email ?? application.email],
    ['Current phone', applicant.phoneNumber],
    ['Residential address', applicant.residentialAddress],
    ['Country of residence', applicant.countryOfResidence],
    ['Emergency contact', contact.name],
    ['Relationship', contact.relationship],
    ['Contact phone', contact.phoneNumber],
    ['Previous qualification', QUALIFICATIONS[education.highestQualification] ?? education.highestQualification],
    ['Institution attended', education.institutionAttended],
    ['Completion year', education.completionYear],
    ['Requested programme', application.programmeId],
    ['Applicant privacy consent', application.consent?.version ? `Confirmed · ${application.consent.version}` : 'Recorded'],
    ['Parent/guardian consent', application.consent?.guardianConsent === true ? 'Confirmed' : 'Not required'],
    ['Additional legacy emergency contact', contact.emergencyContact],
  ];
  const visibleFields = fields.filter(([, value]) => value != null && value !== '');
  return el('details', { class: 'application-details' },
    el('summary', {}, 'View submitted details'),
    el('dl', { class: 'application-facts' }, ...visibleFields.flatMap(([label, value]) => [
      el('dt', {}, label), el('dd', {}, valueText(value)),
    ])));
}