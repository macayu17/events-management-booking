import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readSource = (file) => fs.readFileSync(path.resolve('src', file), 'utf8');

test('admin layout exposes keyboard escape and skip-link access for mobile sidebar', () => {
  const source = readSource('layouts/AdminLayout.jsx');

  assert.match(source, /href="#admin-main-content"/);
  assert.match(source, /id="admin-main-content"/);
  assert.match(source, /const handleEscape = \(event\) =>/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /aria-label="Close sidebar backdrop"/);
  assert.match(source, /type="button"/);
});

test('public layout marks active navigation links for sighted and assistive users', () => {
  const source = readSource('layouts/PublicLayout.jsx');

  assert.match(source, /useLocation/);
  assert.match(source, /aria-current=\{isActive\('\/'\) \? 'page' : undefined\}/);
  assert.match(source, /aria-current=\{isActive\('\/login'\) \? 'page' : undefined\}/);
  assert.match(source, /isActive\('\/'\) \? 'bg-white\/10 text-white'/);
});
