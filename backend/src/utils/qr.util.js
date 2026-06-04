import crypto from 'crypto';

const DEVELOPMENT_QR_SECRET = 'development-only-qr-secret';

function getQRSecret() {
  if (process.env.QR_SECRET_KEY) {
    return process.env.QR_SECRET_KEY;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('QR_SECRET_KEY is required in production');
  }

  return DEVELOPMENT_QR_SECRET;
}

export function generateQRPayload(data) {
  // ticketId is required!
  if (!data.ticketId) {
    throw new Error('ticketId is required for QR payload generation');
  }

  const payload = {
    ticketId: data.ticketId,
    eventId: data.eventId,
    orderId: data.orderId,
    registrationId: data.registrationId,
    issuedAt: Math.floor(Date.now() / 1000)
  };

  // Generate HMAC signature
  const signature = generateQRSignature(payload);

  return {
    ...payload,
    sig: signature
  };
}

export function generateQRSignature(payload) {
  const data = JSON.stringify({
    ticketId: payload.ticketId,
    eventId: payload.eventId,
    orderId: payload.orderId,
    issuedAt: payload.issuedAt
  });

  return crypto
    .createHmac('sha256', getQRSecret())
    .update(data)
    .digest('hex');
}

export function verifyQRSignature(payload) {
  // If no signature provided, fail
  if (!payload.sig) {
    return false;
  }

  try {
    const expectedSignature = generateQRSignature(payload);

    // Handle different signature lengths
    if (payload.sig.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(payload.sig),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('QR Verification error:', error.message);
    return false;
  }
}
