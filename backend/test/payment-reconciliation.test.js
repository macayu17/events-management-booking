import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  assertPhonePeStatusMatchesOrder,
  buildFailedPhonePePaymentData,
} from '../src/services/phonepe-reconciliation.service.js';
import {
  assertRazorpayStatusMatchesOrder,
  buildFailedRazorpayPaymentData,
  hasCapturedRazorpayPayment,
  hasOpenRazorpayPayment,
  isRazorpayOrderPaid,
} from '../src/services/razorpay-reconciliation.service.js';
import { getCheckoutReservation } from '../src/utils/payment-metadata.util.js';

const order = {
  id: 'order-id',
  provider: 'PHONEPE',
  providerOrderId: 'MUID_order-id',
  amountCents: 12500
};

const razorpayOrder = {
  id: 'order-id',
  provider: 'RAZORPAY',
  providerOrderId: 'order_rzp_1',
  amountCents: 12500,
  currency: 'INR'
};

test('PhonePe reconciliation accepts matching provider order id and amount', () => {
  assert.doesNotThrow(() => assertPhonePeStatusMatchesOrder(order, {
    merchantTransactionId: 'MUID_order-id',
    transactionId: 'provider-transaction-id',
    amount: 12500
  }));

  assert.doesNotThrow(() => assertPhonePeStatusMatchesOrder(order, {
    merchantTransactionId: null,
    transactionId: 'MUID_order-id',
    amount: '12500'
  }));
});

test('PhonePe reconciliation rejects mismatched provider order id or amount', () => {
  assert.throws(
    () => assertPhonePeStatusMatchesOrder(order, {
      merchantTransactionId: 'other-order',
      transactionId: 'provider-transaction-id',
      amount: 12500
    }),
    /PhonePe payment details do not match the order/
  );

  assert.throws(
    () => assertPhonePeStatusMatchesOrder(order, {
      merchantTransactionId: 'MUID_order-id',
      transactionId: 'provider-transaction-id',
      amount: 12499
    }),
    /PhonePe payment details do not match the order/
  );
});

test('PhonePe terminal failure metadata closes active checkout reservations', () => {
  const now = new Date('2026-06-03T12:00:00.000Z');
  const paymentData = {
    checkoutReservation: {
      status: 'ACTIVE',
      expiresAt: '2026-06-03T12:20:00.000Z'
    },
    phonePe: {
      transactionId: 'MUID_order-id'
    }
  };

  const failedPaymentData = buildFailedPhonePePaymentData(paymentData, {
    paymentState: 'FAILED',
    amount: 12500
  }, now);

  assert.equal(getCheckoutReservation(failedPaymentData).status, 'RELEASED');
  assert.equal(failedPaymentData.phonePeFailure.state, 'FAILED');
  assert.equal(failedPaymentData.phonePeFailure.recordedAt, now.toISOString());
  assert.equal(failedPaymentData.phonePe.transactionId, 'MUID_order-id');
});

test('PhonePe reconciliation marks terminal failed provider sessions as failed orders', () => {
  const source = fs.readFileSync(path.resolve('src/services/phonepe-reconciliation.service.js'), 'utf8');

  assert.match(source, /status:\s*'FAILED'/);
  assert.match(source, /markCheckoutReservationReleased/);
  assert.match(source, /return \{ outcome: 'failed', statusResponse, order: failedOrder \}/);
});

test('Razorpay reconciliation validates provider order identity and amount', () => {
  assert.doesNotThrow(() => assertRazorpayStatusMatchesOrder(razorpayOrder, {
    id: 'order_rzp_1',
    amount: 12500,
    currency: 'inr'
  }));

  assert.throws(
    () => assertRazorpayStatusMatchesOrder(razorpayOrder, {
      id: 'other-order',
      amount: 12500,
      currency: 'INR'
    }),
    /Razorpay payment details do not match the order/
  );

  assert.throws(
    () => assertRazorpayStatusMatchesOrder(razorpayOrder, {
      id: 'order_rzp_1',
      amount: 12499,
      currency: 'INR'
    }),
    /Razorpay payment details do not match the order/
  );
});

test('Razorpay reconciliation detects paid orders without failing unpaid provider sessions too early', () => {
  assert.equal(isRazorpayOrderPaid({ status: 'paid', amount: 12500, amount_paid: 12500 }), true);
  assert.equal(isRazorpayOrderPaid({ status: 'attempted', amount: 12500, amount_paid: 12500 }), true);
  assert.equal(isRazorpayOrderPaid({ status: 'created', amount: 12500, amount_paid: 0 }), false);
  assert.equal(isRazorpayOrderPaid({ status: 'attempted', amount: 12500, amount_paid: 5000 }), false);

  assert.equal(hasCapturedRazorpayPayment({
    items: [{ status: 'captured', order_id: 'order_rzp_1', amount: 12500, currency: 'INR' }]
  }, razorpayOrder), true);
  assert.equal(hasCapturedRazorpayPayment({
    items: [{ status: 'captured', order_id: 'order_rzp_1', amount: 12499, currency: 'INR' }]
  }, razorpayOrder), false);
  assert.equal(hasOpenRazorpayPayment({ items: [{ status: 'authorized' }] }), true);
  assert.equal(hasOpenRazorpayPayment({ items: [{ status: 'failed' }] }), false);
});

test('Razorpay stale unpaid metadata releases active checkout reservations', () => {
  const now = new Date('2026-06-03T12:00:00.000Z');
  const paymentData = {
    checkoutReservation: {
      status: 'ACTIVE',
      expiresAt: '2026-06-03T12:20:00.000Z'
    },
    razorpayOrder: {
      id: 'order_rzp_1'
    }
  };

  const failedPaymentData = buildFailedRazorpayPaymentData(paymentData, {
    id: 'order_rzp_1',
    status: 'attempted',
    amount: 12500,
    amount_paid: 0,
    currency: 'INR'
  }, now);

  assert.equal(getCheckoutReservation(failedPaymentData).status, 'RELEASED');
  assert.equal(failedPaymentData.razorpayFailure.status, 'attempted');
  assert.equal(failedPaymentData.razorpayFailure.recordedAt, now.toISOString());
  assert.equal(failedPaymentData.razorpayOrder.id, 'order_rzp_1');
});

test('Razorpay reconciliation has dry-run, age gate, and failed-order guards', () => {
  const reconciliationSource = fs.readFileSync(path.resolve('src/services/razorpay-reconciliation.service.js'), 'utf8');
  const orderCompletionSource = fs.readFileSync(path.resolve('src/services/order-completion.service.js'), 'utf8');
  const checkoutSource = fs.readFileSync(path.resolve('src/services/checkout-reservation.service.js'), 'utf8');
  const registrationRoutes = fs.readFileSync(path.resolve('src/routes/registration.routes.js'), 'utf8');
  const webhookRoutes = fs.readFileSync(path.resolve('src/routes/webhook.routes.js'), 'utf8');
  const paymentServiceSource = fs.readFileSync(path.resolve('src/services/payment.service.js'), 'utf8');
  const packageJson = fs.readFileSync(path.resolve('package.json'), 'utf8');

  assert.match(paymentServiceSource, /export async function fetchRazorpayOrderPayments/);
  assert.match(reconciliationSource, /fetchRazorpayOrder\(order\.providerOrderId\)/);
  assert.match(reconciliationSource, /fetchRazorpayOrderPayments\(order\.providerOrderId\)/);
  assert.match(reconciliationSource, /hasOpenRazorpayPayment\(paymentsResponse\)/);
  assert.match(reconciliationSource, /minAgeMinutes = DEFAULT_RAZORPAY_MIN_AGE_MINUTES/);
  assert.match(reconciliationSource, /if \(dryRun\) return \{ outcome: 'would-fail'/);
  assert.match(reconciliationSource, /status:\s*'FAILED'/);
  assert.match(reconciliationSource, /markCheckoutReservationReleased/);
  assert.match(orderCompletionSource, /order\.status === 'FAILED'/);
  assert.match(checkoutSource, /order\.status === 'FAILED'/);
  assert.match(registrationRoutes, /Order payment session expired/);
  assert.match(registrationRoutes, /prisma\.order\.updateMany\(\{/);
  assert.match(registrationRoutes, /providerOrderId:\s*null/);
  assert.match(registrationRoutes, /Checkout session changed before Razorpay handoff completed/);
  assert.match(webhookRoutes, /ignored:\s*true,\s*reason:\s*'order_failed'/);
  assert.match(packageJson, /payments:reconcile-razorpay/);
});
