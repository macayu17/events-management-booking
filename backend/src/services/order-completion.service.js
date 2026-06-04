import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { enqueueTicketGeneration } from './queue.service.js';
import {
  getCheckoutReservation,
  getTicketTierIdFromPaymentData,
  markCheckoutReservationConsumed,
  mergePaymentData
} from '../utils/payment-metadata.util.js';
import { isDiscountUsable } from '../utils/registration-pricing.util.js';

export { getTicketTierIdFromPaymentData, mergePaymentData };

const withStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export async function completePaidOrder(orderId, paymentData = {}, options = {}) {
  const registrationStatus = options.registrationStatus || 'PAID';

  const runCompletion = () => prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        registration: {
          include: {
            event: true
          }
        }
      }
    });

    if (!order) {
      throw withStatus('Order not found', 404);
    }

    if (order.status === 'FAILED') {
      throw withStatus('Order payment session expired', 409);
    }

    const alreadyPaid = order.status === 'PAID';
    let mergedPaymentData = mergePaymentData(order.paymentData, paymentData);
    const checkoutReservation = getCheckoutReservation(mergedPaymentData);
    const hasCheckoutReservation = checkoutReservation.status === 'ACTIVE';

    if (!alreadyPaid && !hasCheckoutReservation) {
      const event = order.registration.event;

      if (event.capacity > 0) {
        const confirmedCount = await tx.registration.count({
          where: {
            eventId: event.id,
            status: { in: ['PAID', 'CONFIRMED'] }
          }
        });

        if (confirmedCount >= event.capacity) {
          throw withStatus('Event is sold out', 409);
        }
      }

      const ticketTierId = getTicketTierIdFromPaymentData(mergedPaymentData);
      if (ticketTierId) {
        const tier = await tx.ticketTier.findUnique({
          where: { id: ticketTierId }
        });

        if (!tier || tier.eventId !== event.id || !tier.isActive) {
          throw withStatus('Selected ticket tier is not available', 400);
        }

        if (tier.capacity && tier.soldCount >= tier.capacity) {
          throw withStatus('Selected ticket tier is sold out', 409);
        }

        const tierUpdate = await tx.ticketTier.updateMany({
          where: {
            id: ticketTierId,
            eventId: event.id,
            isActive: true,
            ...(tier.capacity ? { soldCount: { lt: tier.capacity } } : {})
          },
          data: {
            soldCount: { increment: 1 }
          }
        });

        if (tierUpdate.count === 0) {
          throw withStatus('Selected ticket tier is sold out', 409);
        }
      }

      if (order.discountCodeId) {
        const discount = await tx.discountCode.findUnique({
          where: { id: order.discountCodeId },
        });

        if (!isDiscountUsable(discount)) {
          throw withStatus('Discount code is no longer available', 409);
        }

        const discountUpdate = await tx.discountCode.updateMany({
          where: {
            id: order.discountCodeId,
            isActive: true,
            ...(discount.maxUses ? { usedCount: { lt: discount.maxUses } } : {}),
            ...(discount.validFrom ? { validFrom: { lte: new Date() } } : {}),
            ...(discount.validUntil ? { validUntil: { gte: new Date() } } : {})
          },
          data: { usedCount: { increment: 1 } }
        });

        if (discountUpdate.count === 0) {
          throw withStatus('Discount code is no longer available', 409);
        }
      }
    }

    if (!alreadyPaid && hasCheckoutReservation) {
      const event = order.registration.event;
      const ticketTierId = checkoutReservation.ticketTierId || getTicketTierIdFromPaymentData(mergedPaymentData);

      if (ticketTierId) {
        await tx.ticketTier.updateMany({
          where: {
            id: ticketTierId,
            eventId: event.id,
          },
          data: {
            soldCount: { increment: 1 }
          }
        });
      }

      if (checkoutReservation.discountCodeId || order.discountCodeId) {
        const discountCodeId = checkoutReservation.discountCodeId || order.discountCodeId;
        await tx.discountCode.updateMany({
          where: {
            id: discountCodeId,
          },
          data: { usedCount: { increment: 1 } }
        });
      }

      mergedPaymentData = markCheckoutReservationConsumed(mergedPaymentData);
    }

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paymentData: mergedPaymentData
      }
    });

    await tx.registration.update({
      where: { id: order.registrationId },
      data: { status: registrationStatus }
    });

    return {
      order: updatedOrder,
      registration: order.registration,
      wasAlreadyPaid: alreadyPaid
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000
  });

  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await runCompletion();
      break;
    } catch (error) {
      if (['P2028', 'P2034'].includes(error.code) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  if (!result.wasAlreadyPaid) {
    await enqueueTicketGeneration(orderId);
  }

  return result;
}
