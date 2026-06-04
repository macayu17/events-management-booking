import prisma from '../src/config/db.js';
import { generateTicketPDF } from '../src/services/ticket.service.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const readArg = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const readIntegerArg = (name, fallback) => {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

async function main() {
  const dryRun = !apply;
  const limit = Math.min(readIntegerArg('limit', 50), 200);
  const orderId = readArg('order-id');
  const eventId = readArg('event-id');

  if (dryRun) {
    console.log('[tickets-backfill] dry run only. Pass --apply to regenerate missing ticket records/PDFs.');
  }

  const orders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      ...(orderId ? { id: orderId } : {}),
      ...(eventId ? { registration: { eventId } } : {}),
      OR: [
        { ticket: { is: null } },
        { ticket: { is: { ticketPdfUrl: null } } }
      ]
    },
    include: {
      ticket: true,
      registration: { include: { event: true } }
    },
    orderBy: { createdAt: 'asc' },
    take: limit
  });

  console.log(`Found ${orders.length} paid orders with missing or incomplete tickets`);

  let processed = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would regenerate ticket for order ${order.id}`);
      } else {
        const ticket = await generateTicketPDF(order);
        console.log(`Regenerated ticket ${ticket.id} for order ${order.id}; pdfUrl=${ticket.ticketPdfUrl ? 'present' : 'missing'}`);
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed order ${order.id}:`, error.message);
    }
  }

  console.log(`Done. Processed: ${processed}, Failed: ${failed}, DryRun: ${dryRun}`);
}

main()
  .catch((error) => {
    console.error('Backfill tickets failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
