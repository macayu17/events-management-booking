import { PrismaClient } from '@prisma/client';
import { Resolver } from 'node:dns/promises';

const isNeonHost = (host) => host?.includes('.aws.neon.tech');
const DNS_FALLBACK_TIMEOUT_MS = Number(process.env.NEON_DNS_FALLBACK_TIMEOUT_MS || 2500);

const getNeonProjectIdFromHost = (host) => {
  if (!host) return null;
  const firstLabel = host.split('.')[0];
  return firstLabel?.replace(/-pooler$/, '') || null;
};

const resolveNeonHostWithPublicDns = async (host) => {
  const resolver = new Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  const addresses = await Promise.race([
    resolver.resolve4(host),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Neon DNS fallback timed out')), DNS_FALLBACK_TIMEOUT_MS);
    }),
  ]);
  return addresses?.[0] || null;
};

const buildPrismaDbUrl = async () => {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl);

    if (isNeonHost(parsed.hostname)) {
      const projectId = getNeonProjectIdFromHost(parsed.hostname);

      if (projectId && !parsed.searchParams.has('options')) {
        parsed.searchParams.set('options', `project=${projectId}`);
      }

      try {
        const ip = await resolveNeonHostWithPublicDns(parsed.hostname);
        if (ip) {
          parsed.hostname = ip;
          if (!parsed.port) parsed.port = '5432';
          console.log('ℹ️ Using Neon DNS fallback via public resolver');
        }
      } catch (error) {
        console.warn(`⚠️ Neon DNS fallback skipped: ${error.message}`);
        // If public DNS resolution fails, keep original URL and let normal connection retry handle it.
      }
    }

    if (!parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
    }
    if (!parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '30');
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '30');
    }
    if (!parsed.searchParams.has('statement_cache_size')) {
      parsed.searchParams.set('statement_cache_size', '0');
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

// For Neon/Postgres free tier - strict connection pooling
const connectionUrl = await buildPrismaDbUrl();
const withLimit = connectionUrl && !connectionUrl.includes('connection_limit')
  ? `${connectionUrl}${connectionUrl.includes('?') ? '&' : '?'}connection_limit=5`
  : connectionUrl;

const prismaOptions = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
};

if (withLimit) {
  prismaOptions.datasources = {
    db: {
      url: withLimit,
    },
  };
}

const prisma = new PrismaClient(prismaOptions);

// Test connection on startup with retry
const connectWithRetry = async (retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
      return;
    } catch (err) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Database connection failed after all retries');
        // Don't exit - let the app continue and retry on individual queries
      }
    }
  }
};

if (withLimit) {
  connectWithRetry();
} else {
  console.warn('⚠️ DATABASE_URL is not set - database connection will be skipped until configured');
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
