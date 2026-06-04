import { PrismaClient } from '@prisma/client';
import { formatDebugUrl, requireDebugScript } from './debug-guard.mjs';

requireDebugScript({ name: 'debug-tickets' });

const p = new PrismaClient();

const tickets = await p.ticket.findMany({
  take: 10,
  include: { order: { include: { registration: { select: { eventId: true } } } } }
});

for (const t of tickets) {
  const qr = JSON.parse(t.qrPayload || '{}');
  console.log(JSON.stringify({
    id: t.id,
    short: t.id.substring(0, 8).toUpperCase(),
    orderId: t.orderId,
    eventId: t.order.registration.eventId,
    qrTicketId: qr.ticketId,
    qrMatch: qr.ticketId === t.id,
    qrHasSig: !!qr.sig,
    pdfUrl: formatDebugUrl(t.ticketPdfUrl),
    checkedIn: !!t.checkedInAt,
    scannedAt: !!t.scannedAt
  }));
}

await p.$disconnect();
