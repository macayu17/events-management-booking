import { PrismaClient } from '@prisma/client';
import { formatDebugUrl, requireDebugScript } from './debug-guard.mjs';

requireDebugScript({ name: 'debug-cert-urls' });

const prisma = new PrismaClient();

const all = await prisma.event.findMany({
  where: { OR: [
    { certificateEnabled: true },
    { certificateConfigs: { not: null } },
    { certificateTemplateUrl: { not: null } }
  ]},
  select: { id: true, title: true, certificateTemplateUrl: true, certificateConfigs: true, certificateEnabled: true }
});

for (const e of all) {
  console.log(`\nEvent: ${e.title} (${e.id})`);
  console.log(`  enabled: ${e.certificateEnabled}`);
  console.log(`  Legacy URL: ${formatDebugUrl(e.certificateTemplateUrl)}`);
  const configs = e.certificateConfigs || {};
  for (const [type, config] of Object.entries(configs)) {
    console.log(`  Config [${type}]:`);
    console.log(`    templateUrl: ${formatDebugUrl(config?.templateUrl)}`);
    console.log(`    mapping count: ${config?.mapping?.length || 0}`);
  }
}

// Test if we can fetch the template
if (all.length > 0) {
  const event = all[0];
  const configs = event.certificateConfigs || {};
  const url = configs.participation?.templateUrl || event.certificateTemplateUrl;
  if (url) {
    console.log(`\n--- Testing fetch of: ${formatDebugUrl(url)}`);
    
    if (url.startsWith('r2://')) {
      console.log('  Template is in R2 storage');
      try {
        const { getR2ObjectBuffer } = await import('../src/utils/r2.util.js');
        const buf = await getR2ObjectBuffer(url);
        console.log(`  R2 fetch SUCCESS: ${buf.length} bytes`);
      } catch (err) {
        console.log(`  R2 fetch FAILED: ${err.message}`);
      }
    } else if (url.startsWith('http')) {
      console.log('  Template is HTTP URL');
      try {
        const res = await fetch(url);
        console.log(`  Direct fetch: ${res.status} ${res.statusText}`);
        if (!res.ok && url.includes('cloudinary.com')) {
          const { signCloudinaryRawUrl } = await import('../src/utils/cloudinary.util.js');
          const signed = signCloudinaryRawUrl(url);
          console.log(`  Re-signed URL: ${formatDebugUrl(signed)}`);
          if (signed) {
            const res2 = await fetch(signed);
            console.log(`  Signed fetch: ${res2.status} ${res2.statusText}`);
          }
        }
      } catch (err) {
        console.log(`  HTTP fetch FAILED: ${err.message}`);
      }
    }
  }
}

await prisma.$disconnect();
