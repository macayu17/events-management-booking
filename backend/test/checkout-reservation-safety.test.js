import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceSource = () => fs.readFileSync(
  path.resolve('src/services/checkout-reservation.service.js'),
  'utf8'
);

test('stale checkout release is guarded against provider handoff races', () => {
  const source = serviceSource();

  assert.match(source, /"provider_order_id" IS NULL/);
  assert.match(source, /"payment_data" #>> '\{checkoutReservation,status\}' = 'ACTIVE'/);
  assert.match(source, /"payment_data" #>> '\{checkoutReservation,expiresAt\}' = \$\{reservation\.expiresAt\}/);
  assert.match(source, /phonePe,transactionId/);
  assert.match(source, /phonePe,paymentUrl/);
  assert.match(source, /phonePe,callbackNonce/);
  assert.match(source, /razorpayOrder,id/);
  assert.match(source, /releaseCheckoutReservation\(orderId, \{ now, requireExpired: true \}\)/);
});

test('checkout reservation flow releases expired unstarted holds before reuse', () => {
  const source = serviceSource();

  assert.match(source, /releaseExpiredUnstartedCheckoutReservation\(orderId\)/);
  assert.match(source, /isCheckoutReservationExpired\(order\.paymentData, now\)/);
  assert.match(source, /!hasProviderHandoff\(order\)/);
});

test('availability counts ignore expired unstarted holds but preserve provider handoff holds', () => {
  const source = serviceSource();

  assert.match(source, /const blockingCheckoutHoldSql = \(now\) => Prisma\.sql`/);
  assert.match(source, /o\."provider_order_id" IS NOT NULL/);
  assert.match(source, /phonePe,transactionId/);
  assert.match(source, /phonePe,paymentUrl/);
  assert.match(source, /phonePe,callbackNonce/);
  assert.match(source, /razorpayOrder,id/);
  assert.match(source, /\(o\."payment_data" #>> '\{checkoutReservation,expiresAt\}'\)::timestamptz > \$\{now\}/);
  assert.match(source, /countActiveCapacityHolds\(tx, event\.id, order\.id, now\)/);
  assert.match(source, /countActiveTierHolds\(tx, ticketTierId, order\.id, now\)/);
  assert.match(source, /countActiveDiscountHolds\(tx, order\.discountCodeId, order\.id, now\)/);
  assert.match(source, /export async function countReservedEventCapacity/);
  assert.match(source, /export async function countBlockingCheckoutHoldsForEvent/);
  assert.match(source, /export async function countBlockingCheckoutHoldsForTicketTier/);
});
