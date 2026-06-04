import prisma from '../config/db.js';
import { checkPhonePePaymentStatus } from './payment.service.js';
import { completePaidOrder } from './order-completion.service.js';
import { markCheckoutReservationReleased, mergePaymentData } from '../utils/payment-metadata.util.js';

const withStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const assertPhonePeStatusMatchesOrder = (order, statusResponse) => {
  const returnedOrderIds = new Set([
    statusResponse.merchantTransactionId,
    statusResponse.transactionId
  ].filter(Boolean));
  const returnedAmount = Number(statusResponse.amount);

  if (!returnedOrderIds.has(order.providerOrderId) || !Number.isFinite(returnedAmount) || returnedAmount !== order.amountCents) {
    throw withStatus('PhonePe payment details do not match the order', 400);
  }
};

export const buildFailedPhonePePaymentData = (paymentData, statusResponse, now = new Date()) => {
  const mergedPaymentData = mergePaymentData(paymentData, {
    phonePeStatus: statusResponse,
    phonePeFailure: {
      state: statusResponse?.paymentState || null,
      recordedAt: now.toISOString()
    }
  });

  return markCheckoutReservationReleased(mergedPaymentData, now);
};

async function markPhonePeOrderFailed(order, statusResponse) {
  const now = new Date();

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

    return tx.order.update({
      where: { id: currentOrder.id },
      data: {
        status: 'FAILED',
        paymentData: buildFailedPhonePePaymentData(currentOrder.paymentData, statusResponse, now)
      },
      include: { registration: true }
    });
  });
}

export async function completePhonePeOrderFromProviderStatus(order, { dryRun = false } = {}) {
  if (order.provider !== 'PHONEPE' || !order.providerOrderId) {
    throw withStatus('Order is not awaiting PhonePe verification', 400);
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

  const statusResponse = await checkPhonePePaymentStatus(order.providerOrderId);

  if (statusResponse.success && statusResponse.paymentState === 'COMPLETED') {
    assertPhonePeStatusMatchesOrder(order, statusResponse);

    if (dryRun) {
      return { outcome: 'would-complete', statusResponse };
    }

    const completion = await completePaidOrder(order.id, {
      phonePeStatus: statusResponse
    });

    return { outcome: 'completed', statusResponse, completion };
  }

  if (statusResponse.paymentState === 'PENDING') {
    return { outcome: 'pending', statusResponse };
  }

  if (dryRun) {
    return { outcome: 'would-fail', statusResponse };
  }

  const failedOrder = await markPhonePeOrderFailed(order, statusResponse);
  return { outcome: 'failed', statusResponse, order: failedOrder };
}

export async function reconcileCreatedPhonePeOrders({ limit = 25, minAgeMinutes = 5, dryRun = false } = {}) {
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      provider: 'PHONEPE',
      status: 'CREATED',
      providerOrderId: { not: null },
      updatedAt: { lte: cutoff }
    },
    include: { registration: true },
    orderBy: { updatedAt: 'asc' },
    take: limit
  });

  const results = [];

  for (const order of orders) {
    try {
      const result = await completePhonePeOrderFromProviderStatus(order, { dryRun });
      results.push({
        orderId: order.id,
        providerOrderId: order.providerOrderId,
        outcome: result.outcome,
        state: result.statusResponse?.paymentState || null
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
    pending: results.filter((result) => result.outcome === 'pending').length,
    failed: results.filter((result) => result.outcome === 'failed').length,
    wouldComplete: results.filter((result) => result.outcome === 'would-complete').length,
    wouldFail: results.filter((result) => result.outcome === 'would-fail').length,
    errored: results.filter((result) => result.outcome === 'error').length,
    dryRun,
    results
  };
}
