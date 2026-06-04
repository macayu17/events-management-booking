import { PrismaClient } from '@prisma/client';
import { requireDebugScript } from './debug-guard.mjs';

requireDebugScript({ name: 'debug-expiry', requiredEnv: ['DEBUG_EXPIRY_EVENT_QUERY'] });

const p = new PrismaClient();

const now = new Date();
console.log('Current time:', now.toISOString());

const eventQuery = process.env.DEBUG_EXPIRY_EVENT_QUERY;

const tickets = await p.ticket.findMany({
  where: {
    order: { registration: { event: { title: { contains: eventQuery } } }, status: 'PAID' }
  },
  select: {
    id: true,
    validUntil: true,
    revoked: true,
    scannedAt: true,
    checkedInAt: true,
    order: { select: { registration: { select: { event: { select: { title: true, endTime: true } } } } } }
  },
  take: 5
});

for (const t of tickets) {
  const expired = t.validUntil && now > new Date(t.validUntil);
  console.log(JSON.stringify({
    ticketShort: t.id.substring(0, 8).toUpperCase(),
    validUntil: t.validUntil,
    expired,
    revoked: t.revoked,
    scanned: !!t.scannedAt,
    eventEnd: t.order.registration.event.endTime,
    event: t.order.registration.event.title
  }));
}

await p.$disconnect();
