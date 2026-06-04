import {
  hasInputValue,
  parseNullableDateInput,
  parseOptionalBooleanInput,
  routeInputError
} from './route-input.util.js';

export const EVENT_CATEGORIES = new Set([
  'MUSIC',
  'TECH',
  'SPORTS',
  'ARTS',
  'BUSINESS',
  'EDUCATION',
  'FOOD',
  'HEALTH',
  'SOCIAL',
  'OTHER'
]);

export const readQueryString = (value, fieldName, maxLength = 80) => {
  if (!hasInputValue(value)) return null;
  if (Array.isArray(value)) throw routeInputError(`${fieldName} must be a single value`);
  if (typeof value !== 'string') throw routeInputError(`${fieldName} must be a string`);

  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw routeInputError(`${fieldName} must be ${maxLength} characters or fewer`);
  }

  return normalized;
};

export const normalizeCategoryFilter = (value) => {
  const category = readQueryString(value, 'category', 32);
  if (!category || category.toUpperCase() === 'ALL') return null;

  const normalized = category.toUpperCase();
  if (!EVENT_CATEGORIES.has(normalized)) {
    throw routeInputError('category is invalid');
  }

  return normalized;
};

export const buildDateFilters = ({ upcoming, startDate, endDate }, now = new Date()) => {
  const startTime = {};
  const isUpcoming = parseOptionalBooleanInput(upcoming, 'upcoming', false);
  const parsedStart = parseNullableDateInput(startDate, 'startDate');
  const parsedEnd = parseNullableDateInput(endDate, 'endDate');

  if (isUpcoming) startTime.gte = now;
  if (parsedStart && (!startTime.gte || parsedStart > startTime.gte)) {
    startTime.gte = parsedStart;
  }

  if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
    throw routeInputError('startDate must be before or equal to endDate');
  }

  return {
    ...(Object.keys(startTime).length > 0 ? { startTime } : {}),
    ...(parsedEnd ? { endTime: { lte: parsedEnd } } : {})
  };
};

export const buildEventListWhere = (query, now = new Date()) => {
  const searchText = readQueryString(query.search, 'search');
  const tagText = readQueryString(query.tag, 'tag', 48);
  const categoryFilter = normalizeCategoryFilter(query.category);

  return {
    published: true,
    ...(searchText && {
      OR: [
        { title: { contains: searchText, mode: 'insensitive' } },
        { description: { contains: searchText, mode: 'insensitive' } },
        { location: { contains: searchText, mode: 'insensitive' } },
        { tags: { has: searchText } }
      ]
    }),
    ...(categoryFilter && {
      category: categoryFilter
    }),
    ...(tagText && {
      tags: { has: tagText }
    }),
    ...buildDateFilters(query, now)
  };
};
