import { parseRequiredIntegerInput, routeInputError } from './route-input.util.js';

const MAX_INT_32 = 2147483647;
export const MAX_FIXED_DISCOUNT_AMOUNT = Math.floor(MAX_INT_32 / 100);

export const normalizeDiscountCode = (code) => {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
};

export const resolveSelectedTicketTier = (ticketTiers = [], tierId = null) => {
  if (ticketTiers.length > 0) {
    if (!tierId) {
      return { error: 'Ticket tier is required', statusCode: 400, selectedTier: null };
    }

    const selectedTier = ticketTiers.find((tier) => tier.id === tierId);
    if (!selectedTier) {
      return { error: 'Selected ticket tier is not available', statusCode: 400, selectedTier: null };
    }

    if (selectedTier.capacity && selectedTier.soldCount >= selectedTier.capacity) {
      return { error: 'Selected ticket tier is sold out', statusCode: 409, selectedTier: null };
    }

    return { selectedTier, error: null, statusCode: null };
  }

  if (tierId) {
    return { error: 'Selected ticket tier is not available', statusCode: 400, selectedTier: null };
  }

  return { selectedTier: null, error: null, statusCode: null };
};

export const isDiscountUsable = (discount, now = new Date()) => {
  return Boolean(
    discount &&
    discount.isActive &&
    hasValidDiscountAmount(discount) &&
    (!discount.validFrom || discount.validFrom <= now) &&
    (!discount.validUntil || discount.validUntil >= now) &&
    (!discount.maxUses || discount.usedCount < discount.maxUses)
  );
};

export const hasValidDiscountAmount = (discount) => {
  if (!discount || !Number.isInteger(discount.amount)) return false;

  if (discount.type === 'PERCENTAGE') {
    return discount.amount >= 1 && discount.amount <= 100;
  }

  if (discount.type === 'FIXED_AMOUNT') {
    return discount.amount >= 1 && discount.amount <= MAX_INT_32;
  }

  return false;
};

export const normalizeDiscountAmountForStorage = (type, amount) => {
  const parsedAmount = parseRequiredIntegerInput(amount, 'amount', 1);

  if (type === 'PERCENTAGE') {
    if (parsedAmount > 100) {
      throw routeInputError('percentage discount amount must be between 1 and 100');
    }

    return parsedAmount;
  }

  if (type === 'FIXED_AMOUNT') {
    if (parsedAmount > MAX_FIXED_DISCOUNT_AMOUNT) {
      throw routeInputError(`fixed discount amount cannot exceed ${MAX_FIXED_DISCOUNT_AMOUNT}`);
    }

    return parsedAmount * 100;
  }

  throw routeInputError('type must be PERCENTAGE or FIXED_AMOUNT');
};

export const assertDiscountAmountUsable = (discount) => {
  if (!discount || hasValidDiscountAmount(discount)) return;

  throw routeInputError('Invalid discount code');
};

export const calculateDiscountedAmountCents = (baseAmountCents, discount) => {
  if (!discount) return baseAmountCents;
  assertDiscountAmountUsable(discount);

  if (discount.type === 'PERCENTAGE') {
    return Math.max(0, Math.round(baseAmountCents * (1 - discount.amount / 100)));
  }

  return Math.max(0, baseAmountCents - discount.amount);
};

export const buildTicketTierSnapshot = (tier) => {
  if (!tier) return undefined;

  return {
    ticketTier: {
      id: tier.id,
      name: tier.name,
      priceCents: tier.priceCents
    }
  };
};
