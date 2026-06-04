import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildEventDetailsPayload } from '../src/pages/admin/eventDetailsPayload.js';

test('event details payload converts capacity and optional price consistently', () => {
  assert.deepEqual(
    buildEventDetailsPayload({
      title: 'Launch Night',
      capacity: '120',
      price: '249.50',
    }),
    {
      title: 'Launch Night',
      capacity: 120,
      priceCents: 24950,
    }
  );

  assert.equal(buildEventDetailsPayload({ capacity: '1', price: '' }).priceCents, 0);
});

test('event details payload rejects invalid capacity or price before API submit', () => {
  assert.throws(() => buildEventDetailsPayload({ capacity: '0', price: '0' }), /valid event capacity/);
  assert.throws(() => buildEventDetailsPayload({ capacity: '10.5', price: '0' }), /valid event capacity/);
  assert.throws(() => buildEventDetailsPayload({ capacity: '10', price: '-1' }), /valid event price/);
});

test('form builder fallback stays aligned with backend default phone field', () => {
  const source = fs.readFileSync(new URL('../src/pages/admin/FormBuilderPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /key:\s*'phone'/);
  assert.match(source, /type:\s*'tel'/);
  assert.match(source, /Phone Number/);
});
