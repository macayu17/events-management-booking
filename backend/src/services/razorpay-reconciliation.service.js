import prisma from '../config/db.js';
import { fetchRazorpayOrder, fetchRazorpayOrderPayments } from './payment.service.js';
import { completePaidOrder } from './order-completion.service.js';
import { markCheckoutReservationReleased, mergePaymentData } from '../utils/payment-metadata.util.js';

const DEFAULT_RAZORPAY_MIN_AGE_MINUTES = 60;

const withStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const orderAgeMinutes = (order, now = new Date()) => {
  const anchor = order?.updatedAt || order?.createdAt;
  const time = anchor instanceof Date ? anchor.getTime() : new Date(anchor || 0).getTime();
  return Number.isFinite(time) ? (now.getTime() - time) / 60000 : 0;
};

export const assertRazorpayStatusMatchesOrder = (order, statusResponse = {}) => {
  const providerOrderId = statusResponse.id;
  const amount = Number(statusResponse.amount);
  const currency = String(statusResponse.currency || '').toUpperCase();

  if (
    providerOrderId !== order.providerOrderId ||
    !Number.isFinite(amount) ||
    amount !== order.amountCents ||
    currency !== String(order.currency || '').toUpperCase()
  ) {
    throw withStatus('Razorpay payment details do not match the order', 400);
  }
};

export const isRazorpayOrderPaid = (statusResponse = {}) => {
  const amount = Number(statusResponse.amount);
  const amountPaid = Number(statusResponse.amount_paid);
  return statusResponse.status === 'paid' || (
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isFinite(amountPaid) &&
    amountPaid >= amount
  );
};

const normalizeRazorpayPayments = (paymentsResponse = {}) => {
  if (Array.isArray(paymentsResponse)) return paymentsResponse;
  if (Array.isArray(paymentsResponse.items)) return paymentsResponse.items;
  return [];
};

export const hasCapturedRazorpayPayment = (paymentsResponse = {}, order = {}) => {
  return normalizeRazorpayPayments(paymentsResponse).some((payment) => {
    const amount = Number(payment.amount);
    return payment.status === 'captured' &&
      payment.order_id === order.providerOrderId &&
      Number.isFinite(amount) &&
      amount === order.amountCents &&
      String(payment.currency || '').toUpperCase() === String(order.currency || '').toUpperCase();
  });
};

export const hasOpenRazorpayPayment = (paymentsResponse = {}) => {
  return normalizeRazorpayPayments(paymentsResponse).some((payment) => {
    return ['authorized', 'created'].includes(payment.status);
  });
};

export const buildFailedRazorpayPaymentData = (paymentData, statusResponse, now = new Date()) => {
  const mergedPaymentData = mergePaymentData(paymentData, {
    razorpayStatus: statusResponse,
    razorpayFailure: {
      status: statusResponse?.status || null,
      recordedAt: now.toISOString()
    }
  });

  return markCheckoutReservationReleased(mergedPaymentData, now);
};

async function markRazorpayOrderFailed(order, statusResponse, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: { registration: true }
    });

    if (!currentOrder) {
      throw withStatus('Order not found', 404);
    }

    if (currentOrder.status === 'PAID') {
      return currentOrder;
    }

    if (currentOrder.status === 'FAILED') {
      return currentOrder;
    }

    return tx.order.update({
      where: { id: currentOrder.id },
      data: {
        status: 'FAILED',
        paymentData: buildFailedRazorpayPaymentData(currentOrder.paymentData, statusResponse, now)
      },
      include: { registration: true }
    });
  });
}

export async function completeRazorpayOrderFromProviderStatus(order, {
  now = new Date(),
  minAgeMinutes = DEFAULT_RAZORPAY_MIN_AGE_MINUTES,
  dryRun = false
} = {}) {
  if (order.provider !== 'RAZORPAY' || !order.providerOrderId) {
    throw withStatus('Order is not awaiting Razorpay reconciliation', 400);
  }

  if (order.status === 'PAID') {
    return {
      outcome: 'already-paid',
      completion: {
        order,
        registration: order.registration,
        wasAlreadyPaid: true
      }
    };
  }

  if (order.status === 'FAILED') {
    return { outcome: 'already-failed', statusResponse: order.paymentData?.razorpayStatus || null, order };
  }

  const [statusResponse, paymentsResponse] = await Promise.all([
    fetchRazorpayOrder(order.providerOrderId),
    fetchRazorpayOrderPayments(order.providerOrderId)
  ]);
  assertRazorpayStatusMatchesOrder(order, statusResponse);

  if (isRazorpayOrderPaid(statusResponse) || hasCapturedRazorpayPayment(paymentsResponse, order)) {
    if (dryRun) return { outcome: 'would-complete', statusResponse };

    const completion = await completePaidOrder(order.id, {
      razorpayStatus: statusResponse,
      razorpayPayments: paymentsResponse
    });

    return { outcome: 'completed', statusResponse, completion };
  }

  if (hasOpenRazorpayPayment(paymentsResponse) || orderAgeMinutes(order, now) < minAgeMinutes) {
    return { outcome: 'pending', statusResponse };
  }

  if (dryRun) return { outcome: 'would-fail', statusResponse };

  const failedOrder = await markRazorpayOrderFailed(order, statusResponse, now);
  return { outcome: 'failed', statusResponse, order: failedOrder };
}

export async function reconcileCreatedRazorpayOrders({
  limit = 25,
  minAgeMinutes = DEFAULT_RAZORPAY_MIN_AGE_MINUTES,
  dryRun = false
} = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 25;
  const safeMinAge = Number.isFinite(minAgeMinutes) && minAgeMinutes >= 5
    ? minAgeMinutes
    : DEFAULT_RAZORPAY_MIN_AGE_MINUTES;
  const cutoff = new Date(Date.now() - safeMinAge * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      provider: 'RAZORPAY',
      status: 'CREATED',
      providerOrderId: { not: null },
      updatedAt: { lte: cutoff }
    },
    include: { registration: true },
    orderBy: { updatedAt: 'asc' },
    take: safeLimit
  });

  const results = [];

  for (const order of orders) {
    try {
      const result = await completeRazorpayOrderFromProviderStatus(order, {
        minAgeMinutes: safeMinAge,
        dryRun
      });
      results.push({
        orderId: order.id,
        providerOrderId: order.providerOrderId,
        outcome: result.outcome,
        status: result.statusResponse?.status || null
      });
    } catch (error) {
      results.push({
        orderId: order.id,
        providerOrderId: order.providerOrderId,
        outcome: 'error',
        error: error.message
      });
    }
  }

  return {
    checked: orders.length,
    completed: results.filter((result) => result.outcome === 'completed').length,
    failed: results.filter((result) => result.outcome === 'failed').length,
    pending: results.filter((result) => result.outcome === 'pending').length,
    wouldComplete: results.filter((result) => result.outcome === 'would-complete').length,
    wouldFail: results.filter((result) => result.outcome === 'would-fail').length,
    alreadyFailed: results.filter((result) => result.outcome === 'already-failed').length,
    errored: results.filter((result) => result.outcome === 'error').length,
    dryRun,
    results
  };
}
