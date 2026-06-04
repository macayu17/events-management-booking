export const hasInputValue = (value) => value !== undefined && value !== null && value !== '';

export const routeInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

export const parseBooleanInput = (value, fieldName) => {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  throw routeInputError(`${fieldName} must be a boolean`);
};

export const parseOptionalBooleanInput = (value, fieldName, fallback = false) => {
  if (!hasInputValue(value)) return fallback;
  return parseBooleanInput(value, fieldName);
};

export const parseNullableDateInput = (value, fieldName) => {
  if (!hasInputValue(value)) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw routeInputError(`${fieldName} must be a valid date`);
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw routeInputError(`${fieldName} must be a valid date`);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-][0-2]\d:?[0-5]\d)?)?$/.test(trimmed)) {
    throw routeInputError(`${fieldName} must be a valid date`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw routeInputError(`${fieldName} must be a valid date`);
  }

  const [year, month, day] = trimmed.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) {
    throw routeInputError(`${fieldName} must be a valid date`);
  }

  return date;
};

export const parseRequiredIntegerInput = (value, fieldName, min = Number.MIN_SAFE_INTEGER) => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw routeInputError(`${fieldName} must be an integer`);
  }

  const raw = typeof value === 'number' ? String(value) : value.trim();
  const parsed = typeof value === 'number' ? value : Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || !/^-?\d+$/.test(raw)) {
    throw routeInputError(`${fieldName} must be an integer`);
  }

  if (!Number.isSafeInteger(parsed) || parsed < -2147483648 || parsed > 2147483647) {
    throw routeInputError(`${fieldName} must be a valid 32-bit integer`);
  }

  if (parsed < min) {
    throw routeInputError(`${fieldName} must be at least ${min}`);
  }

  return parsed;
};

export const parseNullableIntegerInput = (value, fieldName, min = Number.MIN_SAFE_INTEGER) => {
  if (!hasInputValue(value)) return null;
  return parseRequiredIntegerInput(value, fieldName, min);
};
