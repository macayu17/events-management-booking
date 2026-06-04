import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readSource = (file) => fs.readFileSync(new URL(`../src/pages/admin/event-control/${file}`, import.meta.url), 'utf8');

test('event-control tiers tab reads admin tiers and avoids silent price coercion', () => {
  const source = readSource('TiersTab.jsx');

  assert.match(source, /api\.get\(`\/admin\/events\/\$\{eventId\}\/tiers`\)/);
  assert.doesNotMatch(source, /parseInt\(e\.target\.value\)\s*\|\|\s*0/);
  assert.match(source, /buildTierPayload\(form\)/);
  assert.match(source, /Could not load ticket tiers/);
});

test('event-control speakers tab reads admin speakers and surfaces fetch errors', () => {
  const source = readSource('SpeakersTab.jsx');

  assert.match(source, /api\.get\(`\/admin\/events\/\$\{eventId\}\/speakers`\)/);
  assert.match(source, /Could not load speakers/);
});

test('team check-in page does not turn load failures into empty attendees', () => {
  const source = fs.readFileSync(new URL('../src/pages/admin/TeamCheckinPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /setLoadError\(errorMessage\(err,\s*'Failed to load team check-in'\)\)/);
  assert.match(source, /Could not load team check-in/);
  assert.match(source, /attendeesError \?/);
  assert.match(source, /Could not load attendees/);
});

test('team events page clears stale errors before successful retry data can render', () => {
  const source = fs.readFileSync(new URL('../src/pages/admin/TeamEventsPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /setError\(null\);\s*const response = await api\.get\('\/team\/events'/);
  assert.match(source, /setEvents\(response\.data\);\s*setError\(null\);/);
  assert.match(source, /Could not load team events/);
});
