import { STEP_FIELDS, validateApplication } from '@/utils/application-schema.js';

/** Reads the form into the plain object the shared schema validates. */
export function collectFormData(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') data[key] = value;
  }
  data.consent = form.querySelector('[name="consent"]')?.checked === true;
  return data;
}

/** Errors for the fields on one step only. */
export function validateStep(data, stepIndex, now = new Date()) {
  const { errors } = validateApplication(data, { now });
  const errorsForStep = {};
  for (const field of STEP_FIELDS[stepIndex] ?? []) {
    if (errors[field]) errorsForStep[field] = errors[field];
  }
  return errorsForStep;
}

export function validateAll(data, now = new Date()) {
  return validateApplication(data, { now });
}

export function firstStepWithError(errors) {
  return STEP_FIELDS.findIndex((fields) => fields.some((field) => errors[field]));
}
