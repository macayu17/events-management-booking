import 'dotenv/config';
import { reconcileCreatedPhonePeOrders } from '../src/services/phonepe-reconciliation.service.js';
import prisma from '../src/config/db.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const readIntegerArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return fallback;

  const parsed = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const main = async () => {
  if (!apply) {
    console.log('[phonepe-reconciliation] dry run only. Pass --apply to complete paid orders or fail terminal unpaid orders.');
  }

  const summary = await reconcileCreatedPhonePeOrders({
    limit: readIntegerArg('limit', 25),
    minAgeMinutes: readIntegerArg('min-age-minutes', 5),
    dryRun: !apply
  });

  console.log(JSON.stringify({
    ...summary,
    applied: apply
  }, null, 2));
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
