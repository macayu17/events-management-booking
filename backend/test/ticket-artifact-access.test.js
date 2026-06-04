import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTicketArtifactBlocker,
  isTicketExpired,
  TICKET_EXPIRY_GRACE_MS,
} from '../src/utils/ticket-access.util.js';

test('ticket artifact access blocks revoked and expired tickets', () => {
  const now = new Date('2026-06-04T12:00:00.000Z');
  const validUntil = new Date(now.getTime() - TICKET_EXPIRY_GRACE_MS - 1);

  assert.deepEqual(getTicketArtifactBlocker(null, now), {
    statusCode: 404,
    message: 'Ticket not found',
  });
  assert.deepEqual(getTicketArtifactBlocker({ revoked: true }, now), {
    statusCode: 410,
    message: 'Ticket has been revoked',
  });
  assert.equal(isTicketExpired({ validUntil }, now), true);
  assert.deepEqual(getTicketArtifactBlocker({ revoked: false, validUntil }, now), {
    statusCode: 410,
    message: 'Ticket has expired',
  });
});

test('ticket artifact access allows fresh paid tickets only', () => {
  const now = new Date('2026-06-04T12:00:00.000Z');
  const validUntil = new Date(now.getTime() - TICKET_EXPIRY_GRACE_MS + 1);

  assert.equal(isTicketExpired({ validUntil }, now), false);
  assert.equal(
    getTicketArtifactBlocker({
      revoked: false,
      validUntil,
      order: { status: 'PAID' },
    }, now),
    null
  );
  assert.deepEqual(
    getTicketArtifactBlocker({
      revoked: false,
      validUntil: null,
      order: { status: 'FAILED' },
    }, now),
    {
      statusCode: 409,
      message: 'Ticket download is available after payment is complete',
    }
  );
});
