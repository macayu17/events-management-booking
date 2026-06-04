const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const parseCapacity = (value) => {
  const capacity = Number(value);
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Enter a valid event capacity');
  }

  return capacity;
};

const parsePriceCents = (value) => {
  if (!hasValue(value)) return 0;

  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Enter a valid event price');
  }

  return Math.round(price * 100);
};

export const buildEventDetailsPayload = (data) => {
  const { price, capacity, ...rest } = data;

  return {
    ...rest,
    capacity: parseCapacity(capacity),
    priceCents: parsePriceCents(price),
  };
};
