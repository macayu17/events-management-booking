import { PrismaClient } from '@prisma/client';
import { formatDebugUrl, requireDebugScript } from './debug-guard.mjs';

requireDebugScript({ name: 'debug-certs' });

const p = new PrismaClient();

const redactConfigUrls = (configs = {}) => Object.fromEntries(
  Object.entries(configs).map(([type, config]) => [
    type,
    {
      ...config,
      templateUrl: formatDebugUrl(config?.templateUrl)
    }
  ])
);

// Check certificate configs
const events = await p.event.findMany({
  select: {
    id: true,
    title: true,
    certificateEnabled: true,
    certificateTemplateUrl: true,
    certificateConfigs: true,
    certificateMapping: true,
  }
});

for (const e of events) {
  if (e.certificateEnabled || e.certificateTemplateUrl || e.certificateConfigs) {
    console.log(JSON.stringify({
      id: e.id,
      title: e.title,
      enabled: e.certificateEnabled,
      templateUrl: formatDebugUrl(e.certificateTemplateUrl),
      configs: redactConfigUrls(e.certificateConfigs || {}),
      mappingCount: Array.isArray(e.certificateMapping) ? e.certificateMapping.length : 0
    }, null, 2));
  }
}

// Check how many tickets have scannedAt set per event
const ticketsWithScan = await p.$queryRaw`
  SELECT e.title, COUNT(*) as total,
    SUM(CASE WHEN t.scanned_at IS NOT NULL THEN 1 ELSE 0 END) as scanned,
    SUM(CASE WHEN t.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) as checked_in
  FROM tickets t
  JOIN orders o ON t.order_id = o.id
  JOIN registrations r ON o.registration_id = r.id
  JOIN events e ON r.event_id = e.id
  WHERE o.status = 'PAID'
  GROUP BY e.title
`;
console.log('\n--- Ticket scan stats per event ---');
console.log(JSON.stringify(ticketsWithScan, null, 2));

await p.$disconnect();
