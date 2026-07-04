import { hasInputValue, parseOptionalBooleanInput, parseRequiredIntegerInput } from './route-input.util.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
// Hard ceiling for `all=true` (export/scanner) fetches so a single request can
// never pull an unbounded number of rows.
export const MAX_EXPORT_ROWS = 10000;

/**
 * Parse pagination query params into Prisma-friendly options.
 *
 * Query params:
 *   - page      1-based page number (default 1)
 *   - pageSize  rows per page (default 50, capped at MAX_PAGE_SIZE)
 *   - all       when "true", returns every row up to MAX_EXPORT_ROWS (for exports)
 *
 * Returns: { page, pageSize, skip, take, all }
 */
export const parsePagination = (query = {}) => {
  const all = parseOptionalBooleanInput(query.all, 'all', false);

  if (all) {
    return { page: 1, pageSize: MAX_EXPORT_ROWS, skip: 0, take: MAX_EXPORT_ROWS, all: true };
  }

  const page = hasInputValue(query.page)
    ? parseRequiredIntegerInput(query.page, 'page', 1)
    : 1;

  const requestedPageSize = hasInputValue(query.pageSize)
    ? parseRequiredIntegerInput(query.pageSize, 'pageSize', 1)
    : DEFAULT_PAGE_SIZE;

  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    all: false
  };
};

/**
 * Build the standard paginated response envelope: { data, pagination }.
 */
export const buildPageResponse = (data, total, { page, pageSize, all }) => ({
  data,
  pagination: {
    page,
    pageSize,
    total,
    totalPages: all ? 1 : Math.max(1, Math.ceil(total / pageSize)),
    all: Boolean(all)
  }
});
