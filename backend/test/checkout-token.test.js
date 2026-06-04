import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCheckoutAccessToken,
  verifyCheckoutAccessToken
} from '../src/utils/checkout-token.util.js';

const makeOrder = (overrides = {}) => ({
  id: 'order-123',
  registrationId: 'registration-123',
  amountCents: 50000,
  currency: 'INR',
  provider: 'RAZORPAY',
  registration: {
    eventId: 'event-123',
    userEmail: 'buyer@example.com',
  },
  ...overrides,
});

test('checkout access tokens verify matching order claims', () => {
  const originalSecret = process.env.CHECKOUT_ACCESS_SECRET;
  process.env.CHECKOUT_ACCESS_SECRET = 'checkout-secret';

  try {
    const order = makeOrder();
    const token = createCheckoutAccessToken(order);
    const claims = verifyCheckoutAccessToken(token, order);

    assert.equal(claims.orderId, 'order-123');
    assert.equal(claims.email, 'buyer@example.com');
    assert.equal(claims.amountCents, 50000);
    assert.equal(claims.provider, 'RAZORPAY');
  } finally {
    if (originalSecret === undefined) delete process.env.CHECKOUT_ACCESS_SECRET;
    else process.env.CHECKOUT_ACCESS_SECRET = originalSecret;
  }
});

test('checkout access tokens fail for tampered, expired, or mismatched orders', () => {
  const originalSecret = process.env.CHECKOUT_ACCESS_SECRET;
  process.env.CHECKOUT_ACCESS_SECRET = 'checkout-secret';

  try {
    const order = makeOrder();
    const token = createCheckoutAccessToken(order);
    const expired = createCheckoutAccessToken(order, -1);
    const tampered = `${token.split('.')[0]}.bad-signature`;

    assert.equal(verifyCheckoutAccessToken(token, makeOrder({ id: 'other-order' })), false);
    assert.equal(verifyCheckoutAccessToken(token, makeOrder({ amountCents: 25000 })), false);
    assert.equal(verifyCheckoutAccessToken(expired, order), false);
    assert.equal(verifyCheckoutAccessToken(tampered, order), false);
    assert.equal(verifyCheckoutAccessToken(null, order), false);
  } finally {
    if (originalSecret === undefined) delete process.env.CHECKOUT_ACCESS_SECRET;
    else process.env.CHECKOUT_ACCESS_SECRET = originalSecret;
  }
});
