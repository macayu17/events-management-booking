import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { requireDebugScript } from './debug-guard.mjs';

const baseUrl = (process.env.DEBUG_SCAN_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const ticketPrefix = process.env.DEBUG_SCAN_TICKET_PREFIX;
const email = process.env.DEBUG_SCAN_EMAIL;
const password = process.env.DEBUG_SCAN_PASSWORD;
const applyScan = process.env.DEBUG_SCAN_APPLY === 'true';

requireDebugScript({
  name: 'debug-scan',
  requiredEnv: ['DEBUG_SCAN_TICKET_PREFIX', 'DEBUG_SCAN_EMAIL', 'DEBUG_SCAN_PASSWORD'],
});

const prisma = new PrismaClient();

async function main() {
  const ticket = await prisma.ticket.findFirst({
    where: { id: { startsWith: ticketPrefix.toLowerCase() } },
    select: { id: true, qrPayload: true }
  });

  if (!ticket) {
    throw new Error(`No ticket found with prefix ${ticketPrefix}`);
  }

  const parsedPayload = JSON.parse(ticket.qrPayload);
  console.log('Ticket ID:', ticket.id);
  console.log('Ticket ID in QR:', parsedPayload.ticketId || '(missing)');

  if (!applyScan) {
    console.log('Dry run only. Set DEBUG_SCAN_APPLY=true to call /api/tickets/verify and check the ticket in.');
    return;
  }

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status);

  if (!loginData.token) {
    console.log('Login failed:', loginData);
    return;
  }

  const verifyRes = await fetch(`${baseUrl}/api/tickets/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginData.token}`
    },
    body: JSON.stringify({ qrPayload: ticket.qrPayload })
  });

  const verifyData = await verifyRes.json();
  console.log('Verify status:', verifyRes.status);
  console.log('Verify response:', JSON.stringify(verifyData, null, 2));
}

main()
  .catch((error) => {
    console.error('Debug scan failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
