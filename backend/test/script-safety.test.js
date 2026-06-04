import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readScript = (file) => fs.readFileSync(path.resolve('scripts', file), 'utf8');
const readSource = (file) => fs.readFileSync(path.resolve('src', file), 'utf8');

test('smoke workflow refuses remote API targets unless explicitly confirmed', () => {
  const source = readScript('smoke-workflow.mjs');

  assert.match(source, /function assertSafeSmokeTarget\(\)/);
  assert.match(source, /isLocalSmokeUrl\(normalizedBaseUrl\)/);
  assert.match(source, /ALLOW_REMOTE_SMOKE/);
  assert.match(source, /CONFIRM_REMOTE_SMOKE/);
  assert.match(source, /assertSafeSmokeTarget\(\);\s*\n\s*log\('health'\)/);
});

test('debug scan is inspect-only unless DEBUG_SCAN_APPLY is set', () => {
  const source = readScript('debug-scan.mjs');
  const applyGuardIndex = source.indexOf("if (!applyScan)");
  const verifyIndex = source.indexOf("fetch(`${baseUrl}/api/tickets/verify`");

  assert.match(source, /const applyScan = process\.env\.DEBUG_SCAN_APPLY === 'true'/);
  assert.ok(applyGuardIndex > -1, 'debug scan should have an apply guard');
  assert.ok(verifyIndex > applyGuardIndex, 'apply guard should run before ticket verification');
  assert.match(source, /Dry run only\. Set DEBUG_SCAN_APPLY=true/);
});

test('ticket backfill defaults to dry-run and scopes paid-order writes', () => {
  const source = readScript('backfill-tickets.mjs');

  assert.match(source, /const apply = args\.has\('--apply'\)/);
  assert.match(source, /const dryRun = !apply/);
  assert.match(source, /readArg\('order-id'\)/);
  assert.match(source, /readArg\('event-id'\)/);
  assert.match(source, /take:\s*limit/);
  assert.match(source, /ticket:\s*\{\s*is:\s*null\s*\}/);
  assert.match(source, /ticketPdfUrl:\s*null/);
});

test('PhonePe reconciliation command is dry-run by default', () => {
  const script = readScript('reconcile-phonepe-orders.mjs');
  const service = readSource('services/phonepe-reconciliation.service.js');

  assert.match(script, /const apply = args\.has\('--apply'\)/);
  assert.match(script, /dryRun:\s*!apply/);
  assert.match(script, /applied:\s*apply/);
  assert.match(service, /completePhonePeOrderFromProviderStatus\(order,\s*\{ dryRun = false \} = \{\}\)/);
  assert.match(service, /if \(dryRun\) \{\s*\n\s*return \{ outcome: 'would-complete'/);
  assert.match(service, /if \(dryRun\) \{\s*\n\s*return \{ outcome: 'would-fail'/);
});

test('set-admin requires exact confirmation and avoids listing users by default', () => {
  const source = readScript('set-admin.mjs');

  assert.match(source, /const confirmedEmail = process\.env\.CONFIRM_ADMIN_EMAIL/);
  assert.match(source, /confirmedEmail !== targetEmail/);
  assert.match(source, /Refusing to update role/);
  assert.doesNotMatch(source, /findMany\(/);
  assert.doesNotMatch(source, /Recent users/);
});

test('debug scripts redact sensitive URLs unless explicitly revealed', () => {
  const guard = readScript('debug-guard.mjs');
  const certUrls = readScript('debug-cert-urls.mjs');
  const certs = readScript('debug-certs.mjs');
  const tickets = readScript('debug-tickets.mjs');
  const cloudinaryDownload = readScript('debug-cloudinary-download.mjs');
  const cloudinarySign = readScript('debug-cloudinary-sign.mjs');

  assert.match(guard, /ALLOW_SENSITIVE_DEBUG_OUTPUT/);
  assert.match(guard, /export function formatDebugUrl/);
  assert.match(certUrls, /formatDebugUrl\(e\.certificateTemplateUrl\)/);
  assert.match(certs, /templateUrl: formatDebugUrl\(e\.certificateTemplateUrl\)/);
  assert.match(tickets, /pdfUrl: formatDebugUrl\(t\.ticketPdfUrl\)/);
  assert.match(cloudinaryDownload, /formatDebugUrl\(url1\)/);
  assert.match(cloudinaryDownload, /formatDebugUrl\(json\.secure_url\)/);
  assert.match(cloudinarySign, /formatDebugUrl\(signedUrl1\)/);
  assert.match(cloudinarySign, /formatDebugUrl\(signedUrl2\)/);
});

test('generic Prisma migration script is deploy-safe', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

  assert.equal(packageJson.scripts['prisma:migrate'], 'prisma migrate deploy');
  assert.equal(packageJson.scripts['prisma:migrate:deploy'], 'prisma migrate deploy');
  assert.equal(packageJson.scripts['prisma:migrate:dev'], 'prisma migrate dev');
});
