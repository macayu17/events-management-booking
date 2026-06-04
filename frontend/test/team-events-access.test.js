import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(
  path.resolve('src/pages/admin/TeamEventsPage.jsx'),
  'utf8'
);

test('team event admin links stay role gated', () => {
  assert.match(source, /\['SUPER_MANAGER', 'MANAGER'\]\.includes\(event\.teamRole\)/);
  assert.match(source, /event\.teamRole === 'SUPER_MANAGER'/);
  assert.doesNotMatch(source, /\/admin\/events\/\$\{event\.id\}\/control/);
});

test('team events page uses icon components instead of emoji empty states', () => {
  assert.match(source, /<Users size=\{28\}/);
  assert.doesNotMatch(source, /👥/);
});
