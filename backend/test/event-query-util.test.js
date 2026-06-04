import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEventListWhere,
  normalizeCategoryFilter,
  readQueryString
} from '../src/utils/event-query.util.js';

test('event query builder normalizes text, tag, category, and date filters', () => {
  const now = new Date('2026-06-04T10:00:00.000Z');
  const where = buildEventListWhere({
    search: '  react summit  ',
    tag: '  workshop  ',
    category: 'tech',
    upcoming: 'true',
    startDate: '2026-06-05T12:00:00.000Z',
    endDate: '2026-06-06T12:00:00.000Z'
  }, now);

  assert.equal(where.published, true);
  assert.equal(where.category, 'TECH');
  assert.deepEqual(where.tags, { has: 'workshop' });
  assert.deepEqual(where.OR, [
    { title: { contains: 'react summit', mode: 'insensitive' } },
    { description: { contains: 'react summit', mode: 'insensitive' } },
    { location: { contains: 'react summit', mode: 'insensitive' } },
    { tags: { has: 'react summit' } }
  ]);
  assert.equal(where.startTime.gte.toISOString(), '2026-06-05T12:00:00.000Z');
  assert.equal(where.endTime.lte.toISOString(), '2026-06-06T12:00:00.000Z');
});

test('event query builder keeps upcoming lower bound when explicit start is older', () => {
  const now = new Date('2026-06-04T10:00:00.000Z');
  const where = buildEventListWhere({
    upcoming: 'true',
    startDate: '2026-06-01T12:00:00.000Z'
  }, now);

  assert.equal(where.startTime.gte, now);
});

test('event query helpers treat blank and ALL filters as absent', () => {
  assert.equal(readQueryString('   ', 'search'), null);
  assert.equal(normalizeCategoryFilter('ALL'), null);
  assert.deepEqual(buildEventListWhere({ category: 'all' }), { published: true });
});

test('event query builder rejects malformed or ambiguous filters', () => {
  assert.throws(() => readQueryString(['a', 'b'], 'search'), /search must be a single value/);
  assert.throws(() => readQueryString({ value: 'a' }, 'search'), /search must be a string/);
  assert.throws(() => readQueryString('x'.repeat(81), 'search'), /search must be 80 characters or fewer/);
  assert.throws(() => normalizeCategoryFilter('bogus'), /category is invalid/);
  assert.throws(() => buildEventListWhere({ upcoming: 'soon' }), /upcoming must be a boolean/);
  assert.throws(() => buildEventListWhere({ startDate: 'not-a-date' }), /startDate must be a valid date/);
  assert.throws(
    () => buildEventListWhere({
      startDate: '2026-06-08T00:00:00.000Z',
      endDate: '2026-06-07T00:00:00.000Z'
    }),
    /startDate must be before or equal to endDate/
  );
});
