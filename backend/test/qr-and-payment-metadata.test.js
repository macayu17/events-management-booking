import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutReservation,
  getCheckoutReservation,
  getTicketTierIdFromPaymentData,
  hasProviderHandoffMetadata,
  hasActiveCheckoutReservation,
  isCheckoutReservationExpired,
  markCheckoutReservationConsumed,
  markCheckoutReservationReleased,
  mergePaymentData
} from '../src/utils/payment-metadata.util.js';
import {
  buildTicketTierSnapshot,
  calculateDiscountedAmountCents,
  hasValidDiscountAmount,
  isDiscountUsable,
  normalizeDiscountAmountForStorage,
  normalizeDiscountCode,
  resolveSelectedTicketTier,
} from '../src/utils/registration-pricing.util.js';

process.env.QR_SECRET_KEY = 'test-secret';
const { generateQRPayload, verifyQRSignature } = await import('../src/utils/qr.util.js');

test('QR payloads are HMAC signed and reject tampering', () => {
  const payload = generateQRPayload({
    ticketId: 'ticket-1',
    orderId: 'order-1',
    eventId: 'event-1',
    registrationId: 'registration-1',
  });

  assert.equal(payload.ticketId, 'ticket-1');
  assert.equal(typeof payload.sig, 'string');
  assert.equal(verifyQRSignature(payload), true);
  assert.equal(verifyQRSignature({ ...payload, eventId: 'other-event' }), false);
});

test('QR payload generation requires a ticket id', () => {
  assert.throws(
    () => generateQRPayload({ orderId: 'order-1', eventId: 'event-1' }),
    /ticketId is required/
  );
});

test('QR signing fails closed in production without QR_SECRET_KEY', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalQrSecret = process.env.QR_SECRET_KEY;

  process.env.NODE_ENV = 'production';
  delete process.env.QR_SECRET_KEY;

  try {
    const qr = await import(`../src/utils/qr.util.js?missing-secret=${Date.now()}`);

    assert.throws(
      () => qr.generateQRPayload({
        ticketId: 'ticket-1',
        orderId: 'order-1',
        eventId: 'event-1',
        registrationId: 'registration-1',
      }),
      /QR_SECRET_KEY is required in production/
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalQrSecret) {
      process.env.QR_SECRET_KEY = originalQrSecret;
    } else {
      delete process.env.QR_SECRET_KEY;
    }
  }
});

test('payment metadata merge preserves ticket tier snapshots', () => {
  const merged = mergePaymentData(
    {
      ticketTier: {
        id: 'tier-vip',
        name: 'VIP',
        priceCents: 49900,
      },
    },
    {
      razorpayOrder: {
        id: 'rzp-order-1',
      },
    }
  );

  assert.equal(getTicketTierIdFromPaymentData(merged), 'tier-vip');
  assert.equal(merged.ticketTier.priceCents, 49900);
  assert.equal(merged.razorpayOrder.id, 'rzp-order-1');
});

test('payment metadata helpers tolerate empty or invalid metadata', () => {
  assert.deepEqual(mergePaymentData(null, { phonePe: { transactionId: 'txn-1' } }), {
    phonePe: { transactionId: 'txn-1' },
  });
  assert.equal(getTicketTierIdFromPaymentData(null), null);
  assert.equal(getTicketTierIdFromPaymentData([]), null);
});

test('checkout reservation metadata records and releases payment holds', () => {
  const now = new Date('2026-06-03T12:00:00.000Z');
  const reservation = buildCheckoutReservation({
    eventId: 'event-1',
    ticketTierId: 'tier-1',
    discountCodeId: 'discount-1',
    now,
    ttlMs: 20 * 60 * 1000,
  });

  const paymentData = mergePaymentData(
    { ticketTier: { id: 'tier-1', name: 'VIP', priceCents: 50000 } },
    { checkoutReservation: reservation }
  );

  assert.equal(getCheckoutReservation(paymentData).status, 'ACTIVE');
  assert.equal(hasActiveCheckoutReservation(paymentData, new Date('2026-06-03T12:19:59.000Z')), true);
  assert.equal(hasActiveCheckoutReservation(paymentData, new Date('2026-06-03T12:20:01.000Z')), true);
  assert.equal(isCheckoutReservationExpired(paymentData, new Date('2026-06-03T12:19:59.000Z')), false);
  assert.equal(isCheckoutReservationExpired(paymentData, new Date('2026-06-03T12:20:01.000Z')), true);

  const released = markCheckoutReservationReleased(paymentData, new Date('2026-06-03T12:10:00.000Z'));
  assert.equal(getCheckoutReservation(released).status, 'RELEASED');
  assert.equal(hasActiveCheckoutReservation(released, now), false);
  assert.equal(isCheckoutReservationExpired(released, new Date('2026-06-03T12:20:01.000Z')), false);
  assert.equal(released.ticketTier.id, 'tier-1');

  const consumed = markCheckoutReservationConsumed(paymentData, new Date('2026-06-03T12:11:00.000Z'));
  assert.equal(getCheckoutReservation(consumed).status, 'CONSUMED');
  assert.equal(hasActiveCheckoutReservation(consumed, now), false);
  assert.equal(consumed.ticketTier.id, 'tier-1');
});

test('provider handoff metadata detects started payment sessions', () => {
  assert.equal(hasProviderHandoffMetadata(null), false);
  assert.equal(hasProviderHandoffMetadata({ phonePe: {} }), false);
  assert.equal(hasProviderHandoffMetadata({ razorpayOrder: {} }), false);

  assert.equal(hasProviderHandoffMetadata({
    phonePe: {
      paymentUrl: 'https://payment.example/checkout',
    },
  }), true);
  assert.equal(hasProviderHandoffMetadata({
    phonePe: {
      transactionId: 'txn-1',
    },
  }), true);
  assert.equal(hasProviderHandoffMetadata({
    razorpayOrder: {
      id: 'order_123',
    },
  }), true);
});

test('R2 references are detected and image uploads do not use R2-only memory storage', async () => {
  process.env.R2_ACCOUNT_ID = 'account';
  process.env.R2_ACCESS_KEY_ID = 'access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret-key';
  process.env.R2_BUCKET = 'bucket';
  process.env.R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';

  const { isR2TemplateRef } = await import('../src/utils/r2.util.js');
  assert.equal(isR2TemplateRef('r2://bucket/certificates/templates/template.pdf'), true);
  assert.equal(isR2TemplateRef('https://account.r2.cloudflarestorage.com/bucket/certificates/templates/template.pdf'), true);
  assert.equal(isR2TemplateRef('r2://bucket/certificates/generated/template.pdf'), false);
  assert.equal(isR2TemplateRef('r2://other-bucket/certificates/templates/template.pdf'), false);
  assert.equal(isR2TemplateRef('https://example.com/template.pdf'), false);

  const { upload, uploadPdf } = await import('../src/middleware/upload.middleware.js?r2-storage-test');
  assert.equal(upload.storage.constructor.name, 'DiskStorage');
  assert.equal(uploadPdf.storage.constructor.name, 'MemoryStorage');
});

test('ticket tier selection rejects missing, unknown, and sold-out tiers', () => {
  const tiers = [
    { id: 'standard', name: 'Standard', priceCents: 25000, capacity: 10, soldCount: 10 },
    { id: 'vip', name: 'VIP', priceCents: 50000, capacity: 5, soldCount: 2 },
  ];

  assert.deepEqual(resolveSelectedTicketTier(tiers, null), {
    selectedTier: null,
    error: 'Ticket tier is required',
    statusCode: 400,
  });
  assert.deepEqual(resolveSelectedTicketTier(tiers, 'missing'), {
    selectedTier: null,
    error: 'Selected ticket tier is not available',
    statusCode: 400,
  });
  assert.deepEqual(resolveSelectedTicketTier(tiers, 'standard'), {
    selectedTier: null,
    error: 'Selected ticket tier is sold out',
    statusCode: 409,
  });

  const result = resolveSelectedTicketTier(tiers, 'vip');
  assert.equal(result.error, null);
  assert.equal(result.selectedTier.id, 'vip');
});

test('ticket tier selection rejects tier ids when event has no tiers', () => {
  assert.deepEqual(resolveSelectedTicketTier([], 'vip'), {
    selectedTier: null,
    error: 'Selected ticket tier is not available',
    statusCode: 400,
  });
  assert.deepEqual(resolveSelectedTicketTier([], null), {
    selectedTier: null,
    error: null,
    statusCode: null,
  });
});

test('discount validation and pricing use cents consistently', () => {
  const now = new Date('2026-05-13T00:00:00.000Z');
  const validPercent = {
    isActive: true,
    type: 'PERCENTAGE',
    amount: 25,
    usedCount: 0,
    maxUses: 2,
    validFrom: new Date('2026-05-01T00:00:00.000Z'),
    validUntil: new Date('2026-05-30T00:00:00.000Z'),
  };
  const validFixed = {
    ...validPercent,
    type: 'FIXED_AMOUNT',
    amount: 10000,
  };

  assert.equal(normalizeDiscountCode(' early_bird '), 'EARLY_BIRD');
  assert.equal(normalizeDiscountAmountForStorage('PERCENTAGE', '25'), 25);
  assert.equal(normalizeDiscountAmountForStorage('FIXED_AMOUNT', '250'), 25000);
  assert.equal(isDiscountUsable(validPercent, now), true);
  assert.equal(hasValidDiscountAmount(validPercent), true);
  assert.equal(calculateDiscountedAmountCents(40000, validPercent), 30000);
  assert.equal(calculateDiscountedAmountCents(40000, validFixed), 30000);
  assert.equal(calculateDiscountedAmountCents(5000, validFixed), 0);
  assert.equal(isDiscountUsable({ ...validPercent, usedCount: 2 }, now), false);
  assert.equal(isDiscountUsable({ ...validPercent, isActive: false }, now), false);
  assert.equal(isDiscountUsable({ ...validPercent, amount: 101 }, now), false);
  assert.equal(hasValidDiscountAmount({ ...validFixed, amount: 0 }), false);
  assert.throws(
    () => normalizeDiscountAmountForStorage('PERCENTAGE', 101),
    /percentage discount amount must be between 1 and 100/
  );
  assert.throws(
    () => normalizeDiscountAmountForStorage('FIXED_AMOUNT', 21474837),
    /fixed discount amount cannot exceed/
  );
  assert.throws(
    () => calculateDiscountedAmountCents(40000, { ...validPercent, amount: 101 }),
    /Invalid discount code/
  );
  assert.throws(
    () => calculateDiscountedAmountCents(40000, { type: 'UNKNOWN', amount: 10 }),
    /Invalid discount code/
  );
});

test('ticket tier snapshot only includes checkout-safe tier metadata', () => {
  assert.equal(buildTicketTierSnapshot(null), undefined);
  assert.deepEqual(
    buildTicketTierSnapshot({
      id: 'vip',
      name: 'VIP',
      priceCents: 50000,
      capacity: 5,
      soldCount: 2,
      internal: 'ignore-me',
    }),
    {
      ticketTier: {
        id: 'vip',
        name: 'VIP',
        priceCents: 50000,
      },
    }
  );
});
