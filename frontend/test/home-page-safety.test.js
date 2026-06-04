import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve('src/pages/public/HomePage.jsx'), 'utf8');

test('home page event cards guard invalid dates and repeated image fallback errors', () => {
  assert.match(source, /const formatEventDate = \(value\) =>/);
  assert.match(source, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(source, /Date to be announced/);
  assert.match(source, /formatEventDate\(event\.startTime\)/);
  assert.match(source, /EVENT_FALLBACK_IMAGE/);
  assert.match(source, /e\.currentTarget\.src !== EVENT_FALLBACK_IMAGE/);
});

test('home page search shell has a focus group for icon and border feedback', () => {
  assert.match(source, /className="group flex min-w-0 items-center/);
  assert.match(source, /focus-within:border-\[#E23744\]\/50/);
  assert.match(source, /group-focus-within:text-\[#E23744\]/);
});
