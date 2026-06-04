import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('provider order uniqueness migration checks duplicates before creating index', () => {
  const migrationPath = path.resolve(
    'prisma/migrations/20260603180000_unique_provider_order_id/migration.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /WHERE "provider_order_id" IS NOT NULL/);
  assert.match(sql, /GROUP BY "provider", "provider_order_id"/);
  assert.match(sql, /HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /RAISE EXCEPTION 'Cannot add orders\(provider, provider_order_id\) uniqueness/);
  assert.match(sql, /CREATE UNIQUE INDEX "orders_provider_provider_order_id_key"/);
});

test('schema and webhook use provider-scoped provider order ids', () => {
  const schema = fs.readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
  const webhookRoutes = fs.readFileSync(path.resolve('src/routes/webhook.routes.js'), 'utf8');

  assert.match(schema, /@@unique\(\[provider, providerOrderId\]\)/);
  assert.match(webhookRoutes, /provider_providerOrderId/);
  assert.match(webhookRoutes, /provider:\s*'RAZORPAY'/);
  assert.match(webhookRoutes, /if \(!orderId\)/);
});
