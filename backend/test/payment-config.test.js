import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const clearPaymentEnv = () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.PHONEPE_CLIENT_ID;
  delete process.env.PHONEPE_CLIENT_SECRET;
  delete process.env.PHONEPE_CLIENT_VERSION;
  delete process.env.PHONEPE_MERCHANT_ID;
  delete process.env.PHONEPE_SALT_KEY;
  delete process.env.PHONEPE_SALT_INDEX;
  delete process.env.PHONEPE_ENV;
};

test('payment service imports without payment gateway credentials', async () => {
  clearPaymentEnv();

  const mod = await import(`../src/services/payment.service.js?import-safe=${Date.now()}`);

  assert.equal(typeof mod.createRazorpayOrder, 'function');
  assert.equal(typeof mod.createPhonePePayment, 'function');
});

test('payment gateways fail fast with configuration errors instead of hardcoded credentials', async () => {
  clearPaymentEnv();

  const mod = await import(`../src/services/payment.service.js?config-check=${Date.now()}`);
  const originalError = console.error;
  let errorLogCount = 0;
  console.error = () => {
    errorLogCount += 1;
  };

  try {
    await assert.rejects(
      () => mod.createRazorpayOrder({
        id: 'order-1',
        amountCents: 50000,
        currency: 'INR',
        registrationId: 'registration-1',
        registration: { eventId: 'event-1' },
      }),
      /Razorpay is not configured/
    );

    await assert.rejects(
      () => mod.createPhonePePayment({
        id: 'order-1',
        amountCents: 50000,
      }, 'http://localhost:5173/payment/phonepe/callback?orderId=order-1'),
      /PhonePe is not configured/
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(errorLogCount, 0);
});

test('PhonePe client credentials use Standard Checkout V2 OAuth flow', async () => {
  clearPaymentEnv();

  process.env.PHONEPE_CLIENT_ID = 'client-id';
  process.env.PHONEPE_CLIENT_SECRET = 'client-secret';
  process.env.PHONEPE_CLIENT_VERSION = '1';
  process.env.PHONEPE_ENV = 'sandbox';

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).endsWith('/v1/oauth/token')) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(options.body.get('client_id'), 'client-id');
      assert.equal(options.body.get('client_secret'), 'client-secret');
      assert.equal(options.body.get('client_version'), '1');
      assert.equal(options.body.get('grant_type'), 'client_credentials');

      return Response.json({
        access_token: 'token-1',
        token_type: 'O-Bearer',
        issued_at: 1,
        expires_at: 9999999999,
      });
    }

    assert.equal(String(url).endsWith('/checkout/v2/pay'), true);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'O-Bearer token-1');

    const body = JSON.parse(options.body);
    assert.equal(body.amount, 50000);
    assert.equal(body.paymentFlow.type, 'PG_CHECKOUT');
    assert.equal(body.paymentFlow.merchantUrls.redirectUrl, 'http://localhost:5173/payment/phonepe/callback?orderId=order-1');

    return Response.json({
      orderId: body.merchantOrderId,
      state: 'PENDING',
      redirectUrl: 'https://mercury-uat.phonepe.com/transact/uat_v2?token=abc',
    });
  };

  try {
    const mod = await import(`../src/services/payment.service.js?phonepe-v2=${Date.now()}`);
    const response = await mod.createPhonePePayment({
      id: 'order-1',
      amountCents: 50000,
    }, 'http://localhost:5173/payment/phonepe/callback?orderId=order-1');

    assert.equal(response.success, true);
    assert.equal(response.transactionId, 'order-1');
    assert.equal(response.paymentUrl, 'https://mercury-uat.phonepe.com/transact/uat_v2?token=abc');
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Razorpay webhook verification uses the webhook secret, not the API key secret', async () => {
  clearPaymentEnv();

  const originalWarn = console.warn;
  console.warn = () => {};
  process.env.RAZORPAY_KEY_SECRET = 'api-key-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';

  try {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
    const apiKeySignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    const webhookSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');

    const mod = await import(`../src/services/payment.service.js?razorpay-webhook-secret=${Date.now()}`);

    assert.equal(mod.verifyRazorpayWebhookSignature(body, apiKeySignature), false);
    assert.equal(mod.verifyRazorpayWebhookSignature(body, webhookSignature), true);
  } finally {
    console.warn = originalWarn;
    clearPaymentEnv();
  }
});

test('PhonePe V2 status does not inject the requested order id into provider identity fields', async () => {
  clearPaymentEnv();

  process.env.PHONEPE_CLIENT_ID = 'client-id';
  process.env.PHONEPE_CLIENT_SECRET = 'client-secret';
  process.env.PHONEPE_CLIENT_VERSION = '1';
  process.env.PHONEPE_ENV = 'sandbox';

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/v1/oauth/token')) {
      return Response.json({
        access_token: 'token-1',
        token_type: 'O-Bearer',
        issued_at: 1,
        expires_at: 9999999999,
      });
    }

    assert.equal(String(url).endsWith('/checkout/v2/order/MUID_order-1/status'), true);
    return Response.json({
      orderId: 'different-provider-order',
      amount: 50000,
      state: 'COMPLETED',
    });
  };

  try {
    const mod = await import(`../src/services/payment.service.js?phonepe-v2-status=${Date.now()}`);
    const status = await mod.checkPhonePePaymentStatus('MUID_order-1');

    assert.equal(status.transactionId, 'different-provider-order');
    assert.equal(status.merchantTransactionId, null);
  } finally {
    global.fetch = originalFetch;
    clearPaymentEnv();
  }
});

test('PhonePe configuration rejects unknown environments', async () => {
  clearPaymentEnv();

  process.env.PHONEPE_CLIENT_ID = 'client-id';
  process.env.PHONEPE_CLIENT_SECRET = 'client-secret';
  process.env.PHONEPE_CLIENT_VERSION = '1';
  process.env.PHONEPE_ENV = 'prod';

  const originalFetch = global.fetch;
  const originalError = console.error;
  global.fetch = async () => {
    throw new Error('fetch should not run for invalid PhonePe env');
  };
  console.error = () => {};

  try {
    const mod = await import(`../src/services/payment.service.js?invalid-phonepe-env=${Date.now()}`);

    await assert.rejects(
      () => mod.checkPhonePePaymentStatus('merchant-order'),
      /PHONEPE_ENV must be one of/
    );
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    clearPaymentEnv();
  }
});
