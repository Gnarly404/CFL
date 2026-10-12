const REQUIRED_PROFILE_FIELDS = [
  { path: ['firstName'], label: 'Legal first name' },
  { path: ['surname'], label: 'Legal surname' },
  { path: ['dateOfBirth'], label: 'Date of birth' },
  { path: ['nationality'], label: 'Nationality' },
  { path: ['phoneNumber'], label: 'Phone number' },
  { path: ['guardian', 'name'], label: 'Emergency contact name' },
  { path: ['guardian', 'relationship'], label: 'Emergency contact relationship' },
  { path: ['guardian', 'phoneNumber'], label: 'Guardian phone' },
  { path: ['guardian', 'emergencyContact'], label: 'Emergency contact name' },
];

function valueAtPath(value, path) {
  return path.reduce((item, key) => item?.[key], value);
}

/** Only fields collected as required during admission count toward profile completion. */
export function missingRequiredProfileFields(profile = {}) {
  return REQUIRED_PROFILE_FIELDS
    .filter(({ path }) => {
      const value = valueAtPath(profile, path);
      return typeof value !== 'string' || value.trim().length === 0;
    })
    .map(({ label }) => label);
}

export function legalName(profile = {}, fallback = '') {
  return [profile.firstName, profile.middleName, profile.surname].filter((part) => typeof part === 'string' && part.trim()).join(' ') || fallback;
}

export function enrollmentStatusLabel(status) {
  const labels = {
    active: 'Active',
    pending_start: 'Starting soon',
    deferred: 'Deferred',
    completed: 'Completed',
    withdrawn: 'Withdrawn',
  };
  if (labels[status]) return labels[status];
  return typeof status === 'string' && status ? status.replaceAll('_', ' ').replace(/^[a-z]/, (letter) => letter.toUpperCase()) : 'Status unavailable';
}