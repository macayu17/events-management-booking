import Razorpay from 'razorpay';
import crypto from 'crypto';

let razorpayClient = null;

const isPresent = (value) => typeof value === 'string' && value.trim().length > 0;

const configError = (message) => {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
};

const logOperationalError = (label, error) => {
  if (error.statusCode) return;
  console.error(label, error);
};

const getRazorpayClient = () => {
  if (!isPresent(process.env.RAZORPAY_KEY_ID) || !isPresent(process.env.RAZORPAY_KEY_SECRET)) {
    throw configError('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }

  return razorpayClient;
};

export async function createRazorpayOrder(order) {
  try {
    const options = {
      amount: order.amountCents, // amount in paise
      currency: order.currency,
      receipt: order.id,
      notes: {
        orderId: order.id,
        registrationId: order.registrationId,
        eventId: order.registration.eventId
      }
    };

    const razorpayOrder = await getRazorpayClient().orders.create(options);
    return razorpayOrder;
  } catch (error) {
    logOperationalError('Razorpay order creation error:', error);
    throw error;
  }
}

export async function fetchRazorpayOrder(providerOrderId) {
  try {
    if (!isPresent(providerOrderId)) {
      throw configError('Razorpay provider order id is required.');
    }

    return await getRazorpayClient().orders.fetch(providerOrderId);
  } catch (error) {
    logOperationalError('Razorpay order fetch error:', error);
    throw error;
  }
}

export async function fetchRazorpayOrderPayments(providerOrderId) {
  try {
    if (!isPresent(providerOrderId)) {
      throw configError('Razorpay provider order id is required.');
    }

    return await getRazorpayClient().orders.fetchPayments(providerOrderId);
  } catch (error) {
    logOperationalError('Razorpay order payments fetch error:', error);
    throw error;
  }
}

export function verifyRazorpayWebhookSignature(body, signature) {
  try {
    if (!isPresent(process.env.RAZORPAY_WEBHOOK_SECRET)) {
      console.warn('Razorpay webhook verification skipped because RAZORPAY_WEBHOOK_SECRET is not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body.toString())
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(String(signature || ''), 'hex');

    return expectedBuffer.length === providedBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// ============================================
// PHONEPE PAYMENT GATEWAY
// ============================================

const PHONEPE_CONFIG = {
  sandbox: {
    pgBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    oauthBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    legacyBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    // Test phone/OTP for sandbox testing
    testPhone: '9999999999',
    testOtp: '123456'
  },
  production: {
    pgBaseUrl: 'https://api.phonepe.com/apis/pg',
    oauthBaseUrl: 'https://api.phonepe.com/apis/identity-manager',
    legacyBaseUrl: 'https://api.phonepe.com/apis/hermes'
  }
};

function getPhonePeCredentials() {
  const clientId = process.env.PHONEPE_CLIENT_ID;
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const clientVersion = Number.parseInt(process.env.PHONEPE_CLIENT_VERSION || '1', 10);

  if (isPresent(clientId) && isPresent(clientSecret)) {
    return {
      flow: 'standardCheckoutV2',
      clientId,
      clientSecret,
      clientVersion: Number.isFinite(clientVersion) ? clientVersion : 1
    };
  }

  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';

  if (!isPresent(merchantId) || !isPresent(saltKey)) {
    throw configError('PhonePe is not configured. Set PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, and PHONEPE_CLIENT_VERSION.');
  }

  return {
    flow: 'legacyV1',
    merchantId,
    saltKey,
    saltIndex
  };
}

function getPhonePeConfig() {
  const env = process.env.PHONEPE_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
  if (!PHONEPE_CONFIG[env]) {
    throw configError('PHONEPE_ENV must be one of: sandbox, production.');
  }

  return PHONEPE_CONFIG[env];
}

function buildPhonePeMerchantOrderId(orderId) {
  return orderId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 63);
}

async function readPhonePeResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function phonePeGatewayError(message, responseData) {
  const error = new Error(message);
  error.statusCode = 502;
  error.gatewayCode = responseData?.code || responseData?.state || null;
  return error;
}

function phonePeMessage(responseData, fallback) {
  return responseData?.message || responseData?.code || responseData?.state || fallback;
}

function phonePeResponseSummary(responseData = {}) {
  return {
    success: responseData.success,
    code: responseData.code,
    state: responseData.state,
    message: responseData.message,
    orderId: responseData.orderId || responseData.data?.merchantTransactionId,
    amount: responseData.amount || responseData.data?.amount
  };
}

async function fetchPhonePeV2Token(creds) {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    client_version: String(creds.clientVersion),
    grant_type: 'client_credentials'
  });

  const response = await fetch(`${getPhonePeConfig().oauthBaseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  });
  const data = await readPhonePeResponse(response);

  if (!response.ok || !data.access_token) {
    throw phonePeGatewayError(`PhonePe authorization failed: ${phonePeMessage(data, 'No access token returned')}`, data);
  }

  return `${data.token_type || 'O-Bearer'} ${data.access_token}`;
}

async function createPhonePeV2Payment(order, callbackUrl, creds) {
  const merchantOrderId = buildPhonePeMerchantOrderId(order.id);
  const accessToken = await fetchPhonePeV2Token(creds);
  const payload = {
    merchantOrderId,
    amount: order.amountCents,
    expireAfter: 1200,
    metaInfo: {
      udf1: order.id,
      udf2: order.registrationId || '',
      udf3: order.registration?.eventId || ''
    },
    paymentFlow: {
      type: 'PG_CHECKOUT',
      message: 'Occasio event ticket payment',
      merchantUrls: {
        redirectUrl: callbackUrl
      }
    }
  };

  const response = await fetch(`${getPhonePeConfig().pgBaseUrl}/checkout/v2/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessToken
    },
    body: JSON.stringify(payload)
  });
  const data = await readPhonePeResponse(response);

  if (!response.ok || !data.redirectUrl) {
    console.error('PhonePe V2 payment initiation failed:', phonePeResponseSummary(data));
    throw phonePeGatewayError(`PhonePe payment initiation failed: ${phonePeMessage(data, 'No redirect URL returned')}`, data);
  }

  return {
    success: true,
    transactionId: merchantOrderId,
    paymentUrl: data.redirectUrl,
    providerResponse: data
  };
}

function generatePhonePeChecksum(base64Payload, endpoint, saltKey, saltIndex) {
  const stringToHash = base64Payload + endpoint + saltKey;
  const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return sha256Hash + '###' + saltIndex;
}

async function createPhonePeLegacyPayment(order, callbackUrl, creds) {
  const merchantTransactionId = buildPhonePeMerchantOrderId(order.id);

  const payload = {
    merchantId: creds.merchantId,
    merchantTransactionId,
    merchantUserId: 'USER' + Date.now(),
    amount: order.amountCents, // Amount in paise
    redirectUrl: callbackUrl,
    redirectMode: 'REDIRECT',
    callbackUrl: callbackUrl,
    paymentInstrument: {
      type: 'PAY_PAGE'
    }
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const endpoint = '/pg/v1/pay';
  const checksum = generatePhonePeChecksum(base64Payload, endpoint, creds.saltKey, creds.saltIndex);

  const response = await fetch(`${getPhonePeConfig().legacyBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum
    },
    body: JSON.stringify({ request: base64Payload })
  });

  const data = await readPhonePeResponse(response);

  if (data.success && data.data?.instrumentResponse?.redirectInfo?.url) {
    return {
      success: true,
      transactionId: merchantTransactionId,
      paymentUrl: data.data.instrumentResponse.redirectInfo.url,
      providerResponse: data
    };
  }

  console.error('PhonePe legacy payment initiation failed:', phonePeResponseSummary(data));
  throw phonePeGatewayError(`PhonePe payment initiation failed: ${phonePeMessage(data, 'No redirect URL returned')}`, data);
}

export async function createPhonePePayment(order, callbackUrl) {
  try {
    const creds = getPhonePeCredentials();

    if (creds.flow === 'standardCheckoutV2') {
      return await createPhonePeV2Payment(order, callbackUrl, creds);
    }

    return await createPhonePeLegacyPayment(order, callbackUrl, creds);
  } catch (error) {
    logOperationalError('PhonePe payment creation error:', error);
    throw error;
  }
}

async function checkPhonePeV2PaymentStatus(merchantOrderId, creds) {
  const accessToken = await fetchPhonePeV2Token(creds);
  const response = await fetch(`${getPhonePeConfig().pgBaseUrl}/checkout/v2/order/${merchantOrderId}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessToken
    }
  });
  const data = await readPhonePeResponse(response);

  if (!response.ok) {
    throw phonePeGatewayError(`PhonePe status check failed: ${phonePeMessage(data, response.statusText)}`, data);
  }

  return {
    success: data.state === 'COMPLETED',
    code: data.state,
    transactionId: data.orderId,
    merchantTransactionId: data.merchantOrderId || data.merchantTransactionId || null,
    amount: data.amount,
    paymentState: data.state,
    paymentInstrument: data.paymentDetails || data.paymentInstrument,
    raw: data
  };
}

async function checkPhonePeLegacyPaymentStatus(merchantTransactionId, creds) {
  const endpoint = `/pg/v1/status/${creds.merchantId}/${merchantTransactionId}`;
  const stringToHash = endpoint + creds.saltKey;
  const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
  const checksum = sha256Hash + '###' + creds.saltIndex;

  const response = await fetch(`${getPhonePeConfig().legacyBaseUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': creds.merchantId
    }
  });

  const data = await readPhonePeResponse(response);

  if (!response.ok) {
    throw phonePeGatewayError(`PhonePe status check failed: ${phonePeMessage(data, response.statusText)}`, data);
  }

  return {
    success: data.success,
    code: data.code,
    transactionId: data.data?.transactionId,
    merchantTransactionId: data.data?.merchantTransactionId,
    amount: data.data?.amount,
    paymentState: data.data?.state,
    paymentInstrument: data.data?.paymentInstrument,
    raw: data
  };
}

export async function checkPhonePePaymentStatus(merchantTransactionId) {
  try {
    const creds = getPhonePeCredentials();

    if (creds.flow === 'standardCheckoutV2') {
      return await checkPhonePeV2PaymentStatus(merchantTransactionId, creds);
    }

    return await checkPhonePeLegacyPaymentStatus(merchantTransactionId, creds);
  } catch (error) {
    console.error('PhonePe status check error:', error);
    throw error;
  }
}

export function verifyPhonePeCallback(xVerifyHeader, responseBody) {
  try {
    const creds = getPhonePeCredentials();
    if (creds.flow !== 'legacyV1') {
      return false;
    }

    const stringToHash = responseBody + '/pg/v1/status' + creds.saltKey;
    const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const expectedChecksum = sha256Hash + '###' + creds.saltIndex;

    return xVerifyHeader === expectedChecksum;
  } catch (error) {
    console.error('PhonePe callback verification error:', error);
    return false;
  }
}
