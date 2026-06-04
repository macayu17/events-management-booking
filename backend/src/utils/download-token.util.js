import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

const getSecret = () => {
  const secret = process.env.TICKET_DOWNLOAD_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('TICKET_DOWNLOAD_SECRET or JWT_SECRET is required for ticket downloads');
  }
  return secret;
};

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (payload) => crypto
  .createHmac('sha256', getSecret())
  .update(payload)
  .digest('base64url');

export const createTicketDownloadToken = (claims, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  const payload = encode({
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  return `${payload}.${sign(payload)}`;
};

export const verifyTicketDownloadToken = (token, expected = {}) => {
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

  if (expected.orderId && claims.orderId !== expected.orderId) {
    return false;
  }

  if (
    expected.ticketId &&
    claims.ticketId !== expected.ticketId &&
    (!expected.orderId || claims.orderId !== expected.orderId)
  ) {
    return false;
  }

  if (expected.email && claims.email !== expected.email) {
    return false;
  }

  return claims;
};
