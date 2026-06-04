import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import prisma from '../src/config/db.js';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL.replace(/\/$/, '')}/api`;
const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const organizerEmail = `codex-smoke-organizer-${runId}@example.com`;
const teamEmail = `codex-smoke-team-${runId}@example.com`;
const attendeeEmail = `codex-smoke-attendee-${runId}@example.com`;
const rsvpEmail = `codex-smoke-rsvp-${runId}@example.com`;
const phonePeEmail = `codex-smoke-phonepe-${runId}@example.com`;
const password = `SmokePass-${runId}`;
const createdEventIds = [];
const createdUserEmails = [organizerEmail, teamEmail];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isLocalSmokeUrl = (value) => {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

function assertSafeSmokeTarget() {
  const normalizedBaseUrl = BASE_URL.replace(/\/$/, '');
  if (isLocalSmokeUrl(normalizedBaseUrl)) return;

  if (
    process.env.ALLOW_REMOTE_SMOKE !== 'true' ||
    process.env.CONFIRM_REMOTE_SMOKE !== normalizedBaseUrl
  ) {
    throw new Error(
      `Refusing remote smoke target ${normalizedBaseUrl}. ` +
      'Use local/disposable environments by default. To override, set ' +
      `ALLOW_REMOTE_SMOKE=true and CONFIRM_REMOTE_SMOKE=${normalizedBaseUrl}.`
    );
  }

  console.warn('[smoke] remote target override enabled; Prisma cleanup still uses the configured DATABASE_URL.');
}

const log = (step, detail = '') => {
  console.log(`[smoke] ${step}${detail ? `: ${detail}` : ''}`);
};

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${path} failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

const authed = (token, method, body) => ({
  method,
  headers: { Authorization: `Bearer ${token}` },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

async function registerUser(email, name) {
  const result = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  assert.ok(result.token);
  return result;
}

async function createEvent(token, overrides = {}) {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const event = await request('/admin/events', authed(token, 'POST', {
    title: `Codex Smoke Event ${runId}`,
    description: 'Automated smoke verification event',
    location: 'Smoke Test Hall',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    capacity: 20,
    priceCents: 50000,
    currency: 'INR',
    type: 'TICKETED',
    category: 'TECH',
    tags: ['smoke', 'codex'],
    ...overrides,
  }));
  createdEventIds.push(event.id);
  return event;
}

async function waitForTicket(orderId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ticket = await prisma.ticket.findUnique({ where: { orderId } });
    if (ticket) {
      try {
        const payload = JSON.parse(ticket.qrPayload || '{}');
        if (payload.ticketId && payload.sig) return ticket;
      } catch {
        // Keep polling until the background ticket writer stores signed JSON.
      }
    }
    await sleep(250);
  }
  throw new Error(`Ticket with signed QR payload was not generated for order ${orderId}`);
}

async function makeTemplatePdfBuffer() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 420]);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function uploadCertificateTemplate(token, eventId) {
  const formData = new FormData();
  const templateBuffer = await makeTemplatePdfBuffer();
  formData.append('file', new Blob([templateBuffer], { type: 'application/pdf' }), 'template.pdf');

  const response = await fetch(`${API_URL}/admin/events/${eventId}/certificates/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`POST /admin/events/${eventId}/certificates/upload failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  assert.ok(payload.url);
  return payload.url;
}

async function cleanup() {
  await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  await prisma.$disconnect();
}

async function main() {
  assertSafeSmokeTarget();

  log('health');
  const healthResponse = await fetch(`${BASE_URL.replace(/\/$/, '')}/health`);
  assert.equal(healthResponse.ok, true);

  log('auth');
  const organizer = await registerUser(organizerEmail, 'Codex Smoke Organizer');
  const teamUser = await registerUser(teamEmail, 'Codex Smoke Scanner');
  const token = organizer.token;

  log('admin event setup');
  const event = await createEvent(token);
  const tier = await request(`/admin/events/${event.id}/tiers`, authed(token, 'POST', {
    name: 'Standard',
    description: 'Smoke-test tier',
    priceCents: 30000,
    capacity: 5,
    sortOrder: 1,
  }));
  await request(`/admin/events/${event.id}/form`, authed(token, 'POST', {
    schemaJson: {
      title: 'Smoke Registration',
      fields: [
        { key: 'name', type: 'text', label: 'Full Name', required: true },
        { key: 'email', type: 'email', label: 'Email', required: true },
        { key: 'phone', type: 'tel', label: 'Phone', required: false },
      ],
    },
  }));
  const discount = await request(`/discounts/events/${event.id}`, authed(token, 'POST', {
    code: `SMOKE${runId.replace(/[^a-z0-9]/gi, '').slice(-6)}`,
    type: 'PERCENTAGE',
    amount: 50,
    maxUses: 5,
  }));
  await request(`/admin/events/${event.id}`, authed(token, 'PUT', { published: true }));

  log('public event surfaces');
  await request(`/events/${event.id}`);
  await request(`/events/${event.id}/form`);
  const tiers = await request(`/events/${event.id}/tiers`);
  assert.equal(tiers.some((item) => item.id === tier.id), true);
  const discountCheck = await request('/discounts/validate', {
    method: 'POST',
    body: JSON.stringify({ eventId: event.id, code: discount.code }),
  });
  assert.equal(discountCheck.code, discount.code);

  log('Razorpay registration and completion');
  const registration = await request(`/events/${event.id}/register`, {
    method: 'POST',
    body: JSON.stringify({
      formResponse: { name: 'Smoke Attendee', email: attendeeEmail, phone: '9999999999' },
      discountCode: discount.code,
      paymentGateway: 'RAZORPAY',
      tierId: tier.id,
    }),
  });
  assert.equal(registration.requiresPayment, true);
  assert.equal(registration.order.amountCents, 15000);
  assert.ok(registration.checkoutAccessToken);

  const checkout = await request(`/orders/${registration.order.id}/create-checkout-session`, {
    method: 'POST',
    body: JSON.stringify({ checkoutAccessToken: registration.checkoutAccessToken }),
  });
  assert.equal(checkout.provider, 'RAZORPAY');
  assert.ok(checkout.checkoutAccessToken);
  const paymentId = `pay_smoke_${runId.replace(/[^a-z0-9]/gi, '')}`;
  const signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${checkout.orderId}|${paymentId}`)
    .digest('hex');
  await request(`/orders/${registration.order.id}/verify-payment`, {
    method: 'POST',
    body: JSON.stringify({
      checkoutAccessToken: checkout.checkoutAccessToken,
      razorpay_payment_id: paymentId,
      razorpay_order_id: checkout.orderId,
      razorpay_signature: signature,
    }),
  });
  const ticket = await waitForTicket(registration.order.id);
  const downloadedTicket = await request(`/tickets/order/${registration.order.id}/download`);
  assert.equal(downloadedTicket.slice(0, 4).toString(), '%PDF');

  log('ticket verify and check-in operations');
  const verify = await request('/tickets/verify', authed(token, 'POST', { qrPayload: ticket.qrPayload }));
  assert.equal(verify.valid, true);
  await request(`/admin/tickets/${ticket.id}/reset-checkin`, authed(token, 'POST'));
  await request(`/admin/tickets/${ticket.id}/checkin`, authed(token, 'POST'));
  await request(`/admin/tickets/${ticket.id}/checkout`, authed(token, 'POST'));

  log('team access');
  const teamMember = await request(`/admin/events/${event.id}/team`, authed(token, 'POST', {
    email: teamEmail,
    name: 'Codex Smoke Scanner',
    role: 'SCANNER',
  }));
  assert.equal(teamMember.role, 'SCANNER');
  await request('/team/events', authed(teamUser.token, 'GET'));
  await request(`/team/events/${event.id}/accept`, authed(teamUser.token, 'POST'));
  await request(`/team/events/${event.id}/checkin-stats`, authed(teamUser.token, 'GET'));

  log('certificates and analytics');
  const templateUrl = await uploadCertificateTemplate(token, event.id);
  await request(`/admin/events/${event.id}/certificates/config`, authed(token, 'PUT', {
    certificateType: 'participation',
    templateUrl,
    mapping: [],
    enabled: true,
  }));
  const testCertificate = await request(`/admin/events/${event.id}/certificates/test`, authed(token, 'POST', {
    certificateType: 'participation',
  }));
  assert.equal(testCertificate.slice(0, 4).toString(), '%PDF');
  const certDryRun = await request(`/admin/events/${event.id}/certificates`, authed(token, 'POST', {
    dryRun: true,
    certificateType: 'participation',
  }));
  assert.equal(certDryRun.count >= 1, true);
  const issuedCertificates = await request(`/admin/events/${event.id}/certificates`, authed(token, 'POST', {
    certificateType: 'participation',
  }));
  assert.equal(issuedCertificates.generated >= 1, true);
  assert.equal(Array.isArray(issuedCertificates.certificates), true);
  const firstCertificateUrl = issuedCertificates.certificates[0]?.certificateUrl;
  assert.ok(firstCertificateUrl);
  if (firstCertificateUrl.startsWith('/uploads/')) {
    const certificateResponse = await fetch(`${BASE_URL.replace(/\/$/, '')}${firstCertificateUrl}`);
    assert.equal(certificateResponse.ok, true);
    const certificateBuffer = Buffer.from(await certificateResponse.arrayBuffer());
    assert.equal(certificateBuffer.slice(0, 4).toString(), '%PDF');
  }
  await request(`/admin/events/${event.id}/analytics`, authed(token, 'GET'));
  await request('/admin/financials', authed(token, 'GET'));

  log('RSVP/free registration');
  const rsvp = await createEvent(token, {
    title: `Codex Smoke RSVP ${runId}`,
    type: 'RSVP',
    priceCents: 0,
  });
  await request(`/admin/events/${rsvp.id}`, authed(token, 'PUT', { published: true }));
  const rsvpRegistration = await request(`/events/${rsvp.id}/register`, {
    method: 'POST',
    body: JSON.stringify({
      formResponse: { name: 'Smoke RSVP', email: rsvpEmail },
      paymentGateway: 'RAZORPAY',
    }),
  });
  assert.equal(rsvpRegistration.requiresPayment, false);
  assert.equal(rsvpRegistration.registration.status, 'CONFIRMED');
  await waitForTicket(rsvpRegistration.order.id);

  log('PhonePe checkout session');
  const phonePeRegistration = await request(`/events/${event.id}/register`, {
    method: 'POST',
    body: JSON.stringify({
      formResponse: { name: 'Smoke PhonePe', email: phonePeEmail },
      paymentGateway: 'PHONEPE',
      tierId: tier.id,
    }),
  });
  assert.ok(phonePeRegistration.checkoutAccessToken);
  const phonePeCheckout = await request(`/orders/${phonePeRegistration.order.id}/create-checkout-session`, {
    method: 'POST',
    body: JSON.stringify({ checkoutAccessToken: phonePeRegistration.checkoutAccessToken }),
  });
  assert.equal(phonePeCheckout.provider, 'PHONEPE');
  assert.ok(phonePeCheckout.paymentUrl);

  log('complete');
}

main()
  .catch((error) => {
    console.error('[smoke] failed:', error.message);
    if (error.payload) {
      console.error('[smoke] payload:', JSON.stringify(error.payload));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (error) {
      console.error('[smoke] cleanup failed:', error.message);
      process.exitCode = 1;
    }
  });
