const asPlainObject = (value) => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};

const CHECKOUT_RESERVATION_TTL_MS = 20 * 60 * 1000;

export const mergePaymentData = (existing, updates) => ({
  ...asPlainObject(existing),
  ...asPlainObject(updates),
});

export const getTicketTierIdFromPaymentData = (paymentData) => {
  return asPlainObject(paymentData).ticketTier?.id || null;
};

export const getCheckoutReservation = (paymentData) => {
  const reservation = asPlainObject(paymentData).checkoutReservation;
  return asPlainObject(reservation);
};

export const hasProviderHandoffMetadata = (paymentData) => {
  const data = asPlainObject(paymentData);
  const phonePe = asPlainObject(data.phonePe);
  const razorpayOrder = asPlainObject(data.razorpayOrder);

  return Boolean(
    phonePe.transactionId ||
    phonePe.paymentUrl ||
    phonePe.callbackNonce ||
    razorpayOrder.id
  );
};

export const hasActiveCheckoutReservation = (paymentData, now = new Date()) => {
  const reservation = getCheckoutReservation(paymentData);
  void now;
  return reservation.status === 'ACTIVE';
};

export const isCheckoutReservationExpired = (paymentData, now = new Date()) => {
  const reservation = getCheckoutReservation(paymentData);
  if (reservation.status !== 'ACTIVE' || !reservation.expiresAt) return false;

  const expiresAt = new Date(reservation.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt <= now;
};

export const buildCheckoutReservation = ({
  eventId,
  ticketTierId = null,
  discountCodeId = null,
  now = new Date(),
  ttlMs = CHECKOUT_RESERVATION_TTL_MS,
} = {}) => ({
  status: 'ACTIVE',
  eventId,
  ticketTierId,
  discountCodeId,
  reservedAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
});

export const markCheckoutReservationReleased = (paymentData, now = new Date()) => {
  const reservation = getCheckoutReservation(paymentData);
  if (reservation.status !== 'ACTIVE') return paymentData;

  return mergePaymentData(paymentData, {
    checkoutReservation: {
      ...reservation,
      status: 'RELEASED',
      releasedAt: now.toISOString(),
    },
  });
};

export const markCheckoutReservationConsumed = (paymentData, now = new Date()) => {
  const reservation = getCheckoutReservation(paymentData);
  if (reservation.status !== 'ACTIVE') return paymentData;

  return mergePaymentData(paymentData, {
    checkoutReservation: {
      ...reservation,
      status: 'CONSUMED',
      consumedAt: now.toISOString(),
    },
  });
};
