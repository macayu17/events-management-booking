const tierInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const parseNonNegativeInteger = (value, fieldName) => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  const raw = String(value).trim();

  if (!Number.isInteger(parsed) || parsed < 0 || raw.startsWith('-') || !/^\d+$/.test(raw)) {
    throw tierInputError(`${fieldName} must be a non-negative integer`);
  }

  return parsed;
};

const parseOptionalNonNegativeInteger = (value, fieldName, fallback) => {
  if (!hasValue(value)) return fallback;
  return parseNonNegativeInteger(value, fieldName);
};

const normalizeName = (value, required = false) => {
  if (!hasValue(value)) {
    if (required) throw tierInputError('Tier name is required');
    return undefined;
  }

  const normalized = String(value).trim();
  if (!normalized) throw tierInputError('Tier name is required');
  return normalized;
};

const normalizeDescription = (value) => (hasValue(value) ? String(value).trim() : null);

const validateCapacityAgainstSoldCount = (capacity, soldCount = 0) => {
  if (capacity !== null && capacity < soldCount) {
    throw tierInputError('Capacity cannot be lower than tickets already sold');
  }
};

export const buildTierCreateData = (body, eventId) => ({
  eventId,
  name: normalizeName(body.name, true),
  description: normalizeDescription(body.description),
  priceCents: parseOptionalNonNegativeInteger(body.priceCents, 'Price', 0),
  capacity: parseOptionalNonNegativeInteger(body.capacity, 'Capacity', null),
  sortOrder: parseOptionalNonNegativeInteger(body.sortOrder, 'Sort order', 0),
});

export const buildTierUpdateData = (body, tier) => {
  const data = {};

  if (body.name !== undefined) data.name = normalizeName(body.name, true);
  if (body.description !== undefined) data.description = normalizeDescription(body.description);
  if (body.priceCents !== undefined) data.priceCents = parseNonNegativeInteger(body.priceCents, 'Price');
  if (body.sortOrder !== undefined) data.sortOrder = parseNonNegativeInteger(body.sortOrder, 'Sort order');
  if (body.capacity !== undefined) {
    data.capacity = parseOptionalNonNegativeInteger(body.capacity, 'Capacity', null);
    validateCapacityAgainstSoldCount(data.capacity, tier.soldCount || 0);
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw tierInputError('isActive must be a boolean');
    data.isActive = body.isActive;
  }

  return data;
};
