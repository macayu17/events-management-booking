import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import {
  buildCheckoutReservation,
  getCheckoutReservation,
  getTicketTierIdFromPaymentData,
  hasProviderHandoffMetadata,
  isCheckoutReservationExpired,
  markCheckoutReservationReleased,
  mergePaymentData
} from '../utils/payment-metadata.util.js';
import { isDiscountUsable } from '../utils/registration-pricing.util.js';

const withStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const providerHandoffAbsentSql = Prisma.sql`
  COALESCE(
    NULLIF("payment_data" #>> '{phonePe,transactionId}', ''),
    NULLIF("payment_data" #>> '{phonePe,paymentUrl}', ''),
    NULLIF("payment_data" #>> '{phonePe,callbackNonce}', ''),
    NULLIF("payment_data" #>> '{razorpayOrder,id}', '')
  ) IS NULL
`;

const hasProviderHandoff = (order) => {
  return Boolean(order?.providerOrderId || hasProviderHandoffMetadata(order?.paymentData));
};

const blockingCheckoutHoldSql = (now) => Prisma.sql`
  (
    o."provider_order_id" IS NOT NULL
    OR COALESCE(
      NULLIF(o."payment_data" #>> '{phonePe,transactionId}', ''),
      NULLIF(o."payment_data" #>> '{phonePe,paymentUrl}', ''),
      NULLIF(o."payment_data" #>> '{phonePe,callbackNonce}', ''),
      NULLIF(o."payment_data" #>> '{razorpayOrder,id}', '')
    ) IS NOT NULL
    OR (
      (o."payment_data" #>> '{checkoutReservation,expiresAt}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      AND (o."payment_data" #>> '{checkoutReservation,expiresAt}')::timestamptz > ${now}
    )
  )
`;

const countActiveCapacityHolds = async (tx, eventId, currentOrderId, now = new Date()) => {
  const rows = await tx.$queryRaw`
    SELECT COUNT(DISTINCT r.id)::int AS count
    FROM "registrations" r
    INNER JOIN "orders" o ON o."registration_id" = r.id
    WHERE r."event_id" = ${eventId}
      AND (
        r."status"::text IN ('PAID', 'CONFIRMED')
        OR (
          o."id" <> ${currentOrderId}
          AND o."status"::text = 'CREATED'
          AND o."payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
          AND ${blockingCheckoutHoldSql(now)}
        )
      )
  `;

  return Number(rows[0]?.count || 0);
};

const countActiveCapacityOnlyHolds = async (tx, eventId, currentOrderId = '__none__', now = new Date()) => {
  const rows = await tx.$queryRaw`
    SELECT COUNT(DISTINCT r.id)::int AS count
    FROM "registrations" r
    INNER JOIN "orders" o ON o."registration_id" = r.id
    WHERE r."event_id" = ${eventId}
      AND o."id" <> ${currentOrderId}
      AND o."status"::text = 'CREATED'
      AND o."payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
      AND ${blockingCheckoutHoldSql(now)}
  `;

  return Number(rows[0]?.count || 0);
};

const countActiveTierHolds = async (tx, ticketTierId, currentOrderId, now = new Date()) => {
  const rows = await tx.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "orders" o
    WHERE o."id" <> ${currentOrderId}
      AND o."status"::text = 'CREATED'
      AND o."payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
      AND ${blockingCheckoutHoldSql(now)}
      AND o."payment_data" #>> '{ticketTier,id}' = ${ticketTierId}
  `;

  return Number(rows[0]?.count || 0);
};

const countActiveDiscountHolds = async (tx, discountCodeId, currentOrderId, now = new Date()) => {
  const rows = await tx.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "orders" o
    WHERE o."id" <> ${currentOrderId}
      AND o."status"::text = 'CREATED'
      AND o."payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
      AND ${blockingCheckoutHoldSql(now)}
      AND o."payment_data" #>> '{checkoutReservation,discountCodeId}' = ${discountCodeId}
  `;

  return Number(rows[0]?.count || 0);
};

export async function countReservedEventCapacity(eventId, now = new Date()) {
  const confirmedCount = await prisma.registration.count({
    where: {
      eventId,
      status: { in: ['PAID', 'CONFIRMED'] }
    }
  });
  const activeHoldCount = await countActiveCapacityOnlyHolds(prisma, eventId, '__availability-check__', now);

  return confirmedCount + activeHoldCount;
}

export async function countBlockingCheckoutHoldsForEvent(eventId, now = new Date()) {
  return countActiveCapacityOnlyHolds(prisma, eventId, '__availability-check__', now);
}

export async function countBlockingCheckoutHoldsForTicketTier(ticketTierId, now = new Date()) {
  return countActiveTierHolds(prisma, ticketTierId, '__availability-check__', now);
}

const findOrderForReservation = (tx, orderId) => tx.order.findUnique({
  where: { id: orderId },
  include: {
    registration: {
      include: {
        event: true
      }
    }
  }
});

const releaseActiveUnstartedReservation = async (
  tx,
  order,
  { now = new Date(), requireExpired = false } = {}
) => {
  if (!order || order.status === 'PAID') {
    return { order: null, released: false };
  }

  const reservation = getCheckoutReservation(order.paymentData);
  if (reservation.status !== 'ACTIVE' || hasProviderHandoff(order)) {
    return { order, released: false };
  }

  if (requireExpired && !isCheckoutReservationExpired(order.paymentData, now)) {
    return { order, released: false };
  }

  const releasedPaymentData = markCheckoutReservationReleased(order.paymentData, now);
  const releasedPaymentDataJson = JSON.stringify(releasedPaymentData);

  const updatedCount = requireExpired
    ? await tx.$executeRaw`
      UPDATE "orders"
      SET "payment_data" = ${releasedPaymentDataJson}::jsonb,
          "updated_at" = NOW()
      WHERE "id" = ${order.id}
        AND "status"::text = 'CREATED'
        AND "provider_order_id" IS NULL
        AND "payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
        AND "payment_data" #>> '{checkoutReservation,expiresAt}' = ${reservation.expiresAt}
        AND ${providerHandoffAbsentSql}
    `
    : await tx.$executeRaw`
      UPDATE "orders"
      SET "payment_data" = ${releasedPaymentDataJson}::jsonb,
          "updated_at" = NOW()
      WHERE "id" = ${order.id}
        AND "status"::text = 'CREATED'
        AND "provider_order_id" IS NULL
        AND "payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
        AND ${providerHandoffAbsentSql}
    `;

  if (updatedCount === 0) {
    const currentOrder = await tx.order.findUnique({ where: { id: order.id } });
    return { order: currentOrder, released: false };
  }

  const updatedOrder = await tx.order.findUnique({ where: { id: order.id } });
  return { order: updatedOrder, released: true };
};

export async function releaseExpiredUnstartedCheckoutReservation(orderId, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId }
    });
    const result = await releaseActiveUnstartedReservation(tx, order, { now, requireExpired: true });
    return result.released ? result.order : null;
  });
}

export async function reserveOrderForCheckout(orderId) {
  await releaseExpiredUnstartedCheckoutReservation(orderId);

  const runReservation = () => prisma.$transaction(async (tx) => {
    let order = await findOrderForReservation(tx, orderId);

    if (!order) {
      throw withStatus('Order not found', 404);
    }

    if (order.status === 'PAID') {
      throw withStatus('Order already paid', 400);
    }

    if (order.status === 'FAILED') {
      throw withStatus('Order payment session expired', 409);
    }

    const now = new Date();
    const existingReservation = getCheckoutReservation(order.paymentData);

    if (
      existingReservation.status === 'ACTIVE' &&
      isCheckoutReservationExpired(order.paymentData, now) &&
      !hasProviderHandoff(order)
    ) {
      const releaseResult = await releaseActiveUnstartedReservation(tx, order, {
        now,
        requireExpired: true
      });
      if (releaseResult.released || releaseResult.order) {
        order = await findOrderForReservation(tx, orderId);
      }
    }

    if (!order) {
      throw withStatus('Order not found', 404);
    }

    if (getCheckoutReservation(order.paymentData).status === 'ACTIVE') {
      return { order, reservedNow: false };
    }

    const event = order.registration.event;

    if (event.capacity > 0) {
      const heldCount = await countActiveCapacityHolds(tx, event.id, order.id, now);
      if (heldCount >= event.capacity) {
        throw withStatus('Event is sold out', 409);
      }
    }

    const ticketTierId = getTicketTierIdFromPaymentData(order.paymentData);
    if (ticketTierId) {
      const tier = await tx.ticketTier.findUnique({
        where: { id: ticketTierId }
      });

      if (!tier || tier.eventId !== event.id || !tier.isActive) {
        throw withStatus('Selected ticket tier is not available', 400);
      }

      const activeTierHolds = tier.capacity ? await countActiveTierHolds(tx, ticketTierId, order.id, now) : 0;
      if (tier.capacity && tier.soldCount + activeTierHolds >= tier.capacity) {
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

      const activeDiscountHolds = discount.maxUses ? await countActiveDiscountHolds(tx, order.discountCodeId, order.id, now) : 0;
      if (discount.maxUses && discount.usedCount + activeDiscountHolds >= discount.maxUses) {
        throw withStatus('Discount code is no longer available', 409);
      }
    }

    const nextPaymentData = mergePaymentData(order.paymentData, {
      checkoutReservation: buildCheckoutReservation({
        eventId: event.id,
        ticketTierId,
        discountCodeId: order.discountCodeId,
        now,
      })
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: { paymentData: nextPaymentData },
      include: {
        registration: {
          include: {
            event: true
          }
        }
      }
    });

    return { order: updatedOrder, reservedNow: true };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runReservation();
    } catch (error) {
      if (['P2028', 'P2034'].includes(error.code) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw withStatus('Failed to reserve checkout', 500);
}

export async function releaseCheckoutReservation(orderId, options = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId }
    });

    const result = await releaseActiveUnstartedReservation(tx, order, options);
    return result.released ? result.order : null;
  });
}

export async function releaseStaleUnstartedCheckoutReservations({ now = new Date(), limit = 100, dryRun = false } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 100;
  const pageSize = Math.min(Math.max(safeLimit * 2, 100), 1000);
  const staleOrderIds = [];
  let checked = 0;
  let offset = 0;

  while (staleOrderIds.length < safeLimit) {
    const candidates = await prisma.$queryRaw`
      SELECT "id", "payment_data" AS "paymentData"
      FROM "orders"
      WHERE "status"::text = 'CREATED'
        AND "provider_order_id" IS NULL
        AND "payment_data" #>> '{checkoutReservation,status}' = 'ACTIVE'
        AND ${providerHandoffAbsentSql}
      ORDER BY "created_at" ASC, "id" ASC
      OFFSET ${offset}
      LIMIT ${pageSize}
    `;

    checked += candidates.length;

    for (const order of candidates) {
      if (staleOrderIds.length >= safeLimit) break;
      if (isCheckoutReservationExpired(order.paymentData, now)) {
        staleOrderIds.push(order.id);
      }
    }

    if (candidates.length < pageSize) break;
    offset += candidates.length;
  }

  const released = [];
  if (!dryRun) {
    for (const orderId of staleOrderIds) {
      const order = await releaseCheckoutReservation(orderId, { now, requireExpired: true });
      if (order) released.push(order.id);
    }
  }

  return {
    checked,
    stale: staleOrderIds.length,
    released: released.length,
    orderIds: dryRun ? staleOrderIds : released,
    dryRun,
  };
}
