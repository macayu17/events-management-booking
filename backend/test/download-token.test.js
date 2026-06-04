import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTicketDownloadToken,
  verifyTicketDownloadToken
} from '../src/utils/download-token.util.js';

test('ticket download tokens verify matching order/email claims', () => {
  const originalSecret = process.env.TICKET_DOWNLOAD_SECRET;
  process.env.TICKET_DOWNLOAD_SECRET = 'download-test-secret';

  const token = createTicketDownloadToken({
    orderId: 'order-123',
    email: 'attendee@example.com'
  });

  assert.ok(verifyTicketDownloadToken(token, {
    orderId: 'order-123',
    email: 'attendee@example.com'
  }));

  assert.equal(verifyTicketDownloadToken(token, {
    orderId: 'other-order',
    email: 'attendee@example.com'
  }), false);

  assert.equal(verifyTicketDownloadToken(token, {
    orderId: 'order-123',
    email: 'other@example.com'
  }), false);

  if (originalSecret) process.env.TICKET_DOWNLOAD_SECRET = originalSecret;
  else delete process.env.TICKET_DOWNLOAD_SECRET;
});

test('expired or tampered ticket download tokens fail closed', () => {
  const originalSecret = process.env.TICKET_DOWNLOAD_SECRET;
  process.env.TICKET_DOWNLOAD_SECRET = 'download-test-secret';

  const expired = createTicketDownloadToken({ orderId: 'order-123' }, -1);
  assert.equal(verifyTicketDownloadToken(expired, { orderId: 'order-123' }), false);

  const valid = createTicketDownloadToken({ orderId: 'order-123' });
  const tampered = `${valid.slice(0, -1)}x`;
  assert.equal(verifyTicketDownloadToken(tampered, { orderId: 'order-123' }), false);

  if (originalSecret) process.env.TICKET_DOWNLOAD_SECRET = originalSecret;
  else delete process.env.TICKET_DOWNLOAD_SECRET;
});
