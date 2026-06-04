import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeRegistrationStatuses } from '../src/utils/admin-analytics.util.js';

test('registration status summary derives failed count from failed orders', () => {
  const summary = summarizeRegistrationStatuses([
    { status: 'PAID', orders: [{ status: 'PAID' }] },
    { status: 'PENDING', orders: [{ status: 'CREATED' }] },
    { status: 'PENDING', orders: [{ status: 'FAILED' }] },
    { status: 'CANCELLED', orders: [{ status: 'FAILED' }] },
  ]);

  assert.deepEqual(summary, {
    paidRegistrations: 1,
    pendingRegistrations: 2,
    failedRegistrations: 2,
    cancelledRegistrations: 1,
  });
});
