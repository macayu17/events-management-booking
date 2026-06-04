import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTierCreateData, buildTierUpdateData } from '../src/utils/tier-input.util.js';

test('ticket tier input accepts explicit non-negative integer values', () => {
  assert.deepEqual(buildTierCreateData({
    name: 'VIP',
    description: 'Front row access',
    priceCents: '50000',
    capacity: '40',
    sortOrder: '2',
  }, 'event-1'), {
    eventId: 'event-1',
    name: 'VIP',
    description: 'Front row access',
    priceCents: 50000,
    capacity: 40,
    sortOrder: 2,
  });
});

test('ticket tier input rejects invalid and negative numbers instead of coercing to zero', () => {
  assert.throws(() => buildTierCreateData({ name: 'VIP', priceCents: 'free' }, 'event-1'), /Price must be a non-negative integer/);
  assert.throws(() => buildTierCreateData({ name: 'VIP', capacity: '-1' }, 'event-1'), /Capacity must be a non-negative integer/);
  assert.throws(() => buildTierUpdateData({ sortOrder: '1.5' }, { soldCount: 0 }), /Sort order must be a non-negative integer/);
});

test('ticket tier capacity cannot be lowered below sold count', () => {
  assert.throws(
    () => buildTierUpdateData({ capacity: '2' }, { soldCount: 3 }),
    /Capacity cannot be lower than tickets already sold/
  );

  assert.deepEqual(buildTierUpdateData({ capacity: '' }, { soldCount: 3 }), { capacity: null });
});
