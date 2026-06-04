import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve('src/routes/event.routes.js'), 'utf8');

test('public event list route uses the validated event query builder', () => {
  const routeStart = source.indexOf("router.get('/'");
  const routeEnd = source.indexOf('// Get available categories', routeStart);
  const route = source.slice(routeStart, routeEnd);

  assert.notEqual(routeStart, -1);
  assert.match(source, /import \{ buildEventListWhere \} from '..\/utils\/event-query\.util\.js'/);
  assert.match(route, /const where = buildEventListWhere\(req\.query\)/);
  assert.match(source, /const logRouteError = \(message,\s*error\) =>/);
  assert.match(route, /sendRouteError\(res,\s*error,\s*'Failed to fetch events'\)/);
  assert.match(route, /logRouteError\('Get events error',\s*error\)/);
  assert.doesNotMatch(route, /new Date\(startDate\)/);
  assert.doesNotMatch(route, /new Date\(endDate\)/);
  assert.doesNotMatch(route, /upcoming === 'true'/);
});

test('event query utility validates categories, booleans, and dates before Prisma receives them', () => {
  const utilSource = fs.readFileSync(path.resolve('src/utils/event-query.util.js'), 'utf8');

  assert.match(utilSource, /EVENT_CATEGORIES = new Set/);
  assert.match(utilSource, /parseOptionalBooleanInput\(upcoming,\s*'upcoming'/);
  assert.match(utilSource, /parseNullableDateInput\(startDate,\s*'startDate'\)/);
  assert.match(utilSource, /parseNullableDateInput\(endDate,\s*'endDate'\)/);
  assert.match(utilSource, /throw routeInputError\('category is invalid'\)/);
  assert.match(utilSource, /throw routeInputError\('startDate must be before or equal to endDate'\)/);
});
