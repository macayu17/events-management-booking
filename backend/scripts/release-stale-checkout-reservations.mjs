import 'dotenv/config';
import prisma from '../src/config/db.js';
import { releaseStaleUnstartedCheckoutReservations } from '../src/services/checkout-reservation.service.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : 100;

async function main() {
  if (!apply) {
    console.log('[checkout-reservations] dry run only. Pass --apply to release stale unstarted checkout reservations.');
  }

  const result = await releaseStaleUnstartedCheckoutReservations({ limit, dryRun: !apply });

  console.log(JSON.stringify({
    ...result,
    applied: apply,
  }, null, 2));

  if (!apply && result.orderIds.length > 0) {
    console.log('[checkout-reservations] candidate order ids were not changed.');
  }
}

main()
  .catch((error) => {
    console.error('[checkout-reservations] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
