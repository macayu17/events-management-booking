import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 60 * 60;

const getSecret = () => {
  const secret = process.env.CHECKOUT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('CHECKOUT_ACCESS_SECRET or JWT_SECRET is required for checkout access tokens');
  }
  return secret;
};

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (payload) => crypto
  .createHmac('sha256', getSecret())
  .update(payload)
  .digest('base64url');

const buildOrderClaims = (order) => ({
  orderId: order.id,
  registrationId: order.registrationId,
  eventId: order.registration?.eventId,
  email: order.registration?.userEmail,
  amountCents: order.amountCents,
  currency: order.currency,
  provider: order.provider,
});

export const createCheckoutAccessToken = (order, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  const payload = encode({
    ...buildOrderClaims(order),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  return `${payload}.${sign(payload)}`;
};

export const verifyCheckoutAccessToken = (token, order) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return false;
  }

  const [payload, signature] = token.split('.');
  const expectedSignature = sign(payload);
  const provided = Buffer.from(signature || '');
  const expectedBuffer = Buffer.from(expectedSignature);

  if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) {
    return false;
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = buildOrderClaims(order);
  return Object.entries(expected).every(([key, value]) => value === undefined || claims[key] === value)
    ? claims
    : false;
};
