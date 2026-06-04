import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCheckInFailure, mapCheckOutFailure, mapResetFailure, mapTicketScanCheckInFailure } from '../src/utils/checkin-response.util.js';

test('check-in response mapping preserves blocked reason semantics', () => {
  assert.deepEqual(mapCheckInFailure({ blockedReason: 'not-found' }), {
    status: 404,
    body: { error: 'Ticket not found' }
  });

  assert.deepEqual(mapCheckInFailure({ blockedReason: 'revoked' }), {
    status: 400,
    body: { error: 'Ticket has been revoked' }
  });

  assert.deepEqual(mapCheckInFailure({ blockedReason: 'expired' }), {
    status: 400,
    body: { error: 'Ticket has expired' }
  });

  assert.deepEqual(mapCheckInFailure({ blockedReason: 'not-eligible' }), {
    status: 400,
    body: { error: 'Ticket is not eligible for check-in' }
  });

  const fallbackAt = new Date('2026-01-01T10:00:00Z');
  assert.deepEqual(mapCheckInFailure({ blockedReason: 'already-checked-in', fallbackAt }), {
    status: 400,
    body: { error: 'Already checked in', checkedInAt: fallbackAt }
  });
});

test('check-out response mapping keeps state-specific errors', () => {
  assert.deepEqual(mapCheckOutFailure({ blockedReason: 'not-checked-in' }), {
    status: 400,
    body: { error: 'Not checked in yet' }
  });

  const checkedOutAt = new Date('2026-01-01T11:00:00Z');
  assert.deepEqual(mapCheckOutFailure({ blockedReason: 'already-checked-out', checkedOutAt }), {
    status: 400,
    body: { error: 'Already checked out', checkedOutAt }
  });
});

test('reset response mapping reports races as conflicts', () => {
  assert.deepEqual(mapResetFailure({ blockedReason: 'state-changed' }), {
    status: 409,
    body: { error: 'Ticket check-in state changed. Refresh and try again.' }
  });

  assert.deepEqual(mapResetFailure({ blockedReason: 'not-checked-in' }), {
    status: 400,
    body: { error: 'No check-in to reset' }
  });
});

test('ticket scan response mapping keeps scanner envelope', () => {
  assert.deepEqual(mapTicketScanCheckInFailure({ blockedReason: 'revoked' }), {
    status: 400,
    body: { valid: false, error: 'Ticket has been revoked' }
  });

  const scannedAt = new Date('2026-01-01T12:00:00Z');
  const attendee = { name: 'Ada' };
  assert.deepEqual(mapTicketScanCheckInFailure({ blockedReason: 'already-checked-in', scannedAt }, { attendee }), {
    status: 400,
    body: {
      valid: false,
      alreadyScanned: true,
      error: 'Ticket already used',
      scannedAt,
      attendee
    }
  });
});
