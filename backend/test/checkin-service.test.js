import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCheckInBlocker, classifyCheckOutBlocker, classifyResetBlocker, isTicketExpired } from '../src/services/checkin.service.js';

test('ticket expiry allows a 24-hour grace window after validUntil', () => {
  const now = Date.now();

  assert.equal(isTicketExpired({ validUntil: null }), false);
  assert.equal(isTicketExpired({ validUntil: new Date(now - (23 * 60 * 60 * 1000)) }), false);
  assert.equal(isTicketExpired({ validUntil: new Date(now - (25 * 60 * 60 * 1000)) }), true);
});

test('ticket checkout classifies the current blocker after a lost atomic update race', () => {
  const checkedOutAt = new Date();
  const result = classifyCheckOutBlocker({
    scannedAt: new Date(),
    checkedInAt: new Date(),
    checkedOutAt,
    revoked: false,
    validUntil: null
  });

  assert.equal(result.success, false);
  assert.equal(result.blockedReason, 'already-checked-out');
  assert.equal(result.checkedOutAt, checkedOutAt);
});

test('ticket reset treats existing state after a failed reset as a race', () => {
  const result = classifyResetBlocker({
    scannedAt: new Date(),
    checkedInAt: new Date(),
    checkedOutAt: null,
    revoked: true,
    validUntil: null
  });

  assert.equal(result.success, false);
  assert.equal(result.blockedReason, 'state-changed');
});

test('ticket checkout blocks missing check-in state', () => {
  assert.equal(classifyCheckOutBlocker({
    scannedAt: null,
    checkedInAt: null,
    checkedOutAt: null,
    revoked: false,
    validUntil: null
  }).blockedReason, 'not-checked-in');
});

test('ticket check-in blocks unpaid or unconfirmed tickets', () => {
  assert.equal(classifyCheckInBlocker({
    scannedAt: new Date(),
    checkedInAt: null,
    checkedOutAt: null,
    revoked: false,
    validUntil: null,
    order: { status: 'CREATED', registration: { status: 'PENDING' } }
  }).blockedReason, 'not-eligible');

  assert.equal(classifyCheckInBlocker({
    scannedAt: new Date(),
    checkedInAt: null,
    checkedOutAt: null,
    revoked: false,
    validUntil: null,
    order: { status: 'PAID', registration: { status: 'CANCELLED' } }
  }).blockedReason, 'not-eligible');
});
