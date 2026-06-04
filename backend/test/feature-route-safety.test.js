import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve('src/routes/feature.routes.js'), 'utf8');

const routeBlock = (startNeedle, endNeedle) => {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(start, -1, `${startNeedle} route should exist`);
  assert.notEqual(end, -1, `${endNeedle} marker should exist after ${startNeedle}`);

  return source.slice(start, end);
};

test('admin ticket tier reads use authenticated event access instead of public published gate', () => {
  const route = routeBlock("router.get('/admin/events/:eventId/tiers'", '// Create tier');

  assert.match(route, /authenticate/);
  assert.match(route, /findAdminEvent\(req,\s*eventId\)/);
  assert.match(route, /where:\s*\{\s*eventId\s*\}/);
  assert.doesNotMatch(route, /findPublishedEvent/);
  assert.doesNotMatch(route, /isActive:\s*true/);
});

test('admin speaker reads use authenticated event access instead of public published gate', () => {
  const route = routeBlock("router.get('/admin/events/:eventId/speakers'", '// Create speaker');

  assert.match(route, /authenticate/);
  assert.match(route, /findAdminEvent\(req,\s*eventId\)/);
  assert.match(route, /where:\s*\{\s*eventId\s*\}/);
  assert.doesNotMatch(route, /findPublishedEvent/);
});

test('admin speaker and reminder writes reject partial numeric coercion', () => {
  assert.match(source, /parseRequiredIntegerInput/);
  assert.match(source, /parseBooleanInput/);
  assert.match(source, /buildSpeakerCreateData\(req\.body,\s*eventId\)/);
  assert.match(source, /buildSpeakerUpdateData\(req\.body\)/);
  assert.match(source, /buildReminderCreateData\(req\.body,\s*eventId\)/);
  assert.match(source, /buildReminderUpdateData\(req\.body\)/);
  assert.match(source, /sendFeatureError\(res,\s*error,\s*'Failed to create reminder'\)/);
  assert.doesNotMatch(source, /parseInt\(/);
});
