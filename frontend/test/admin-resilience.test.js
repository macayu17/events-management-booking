import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readPage = (file) => fs.readFileSync(new URL(`../src/pages/${file}`, import.meta.url), 'utf8');

test('admin dashboard load failures render retryable errors instead of default zero totals', () => {
  const source = readPage('admin/AdminDashboard.jsx');

  assert.match(source, /import \{ ErrorState, LoadingBlock \} from '..\/..\/components\/StateBlock'/);
  assert.match(source, /const \[loadError, setLoadError\] = useState\(''\)/);
  assert.match(source, /const events = Array\.isArray\(response\.data\) \? response\.data : \[\]/);
  assert.match(source, /toFiniteNumber\(event\.priceCents\)/);
  assert.match(source, /Could not load dashboard/);
});

test('financials page normalizes payloads and preserves an explicit load error state', () => {
  const source = readPage('admin/FinancialsPage.jsx');

  assert.match(source, /const normalizeFinancials = \(payload = \{\}\) =>/);
  assert.match(source, /revenueChart: Array\.isArray\(payload\.revenueChart\)/);
  assert.match(source, /setLoadError\(message\)/);
  assert.match(source, /Could not load financials/);
  assert.match(source, /format\(toFiniteNumber\(amount\)\)/);
});

test('analytics page normalizes brittle numeric fields before rendering charts', () => {
  const source = readPage('admin/AnalyticsPage.jsx');

  assert.match(source, /const normalizeAnalytics = \(payload = \{\}\) =>/);
  assert.match(source, /conversionRate: toFiniteNumber\(payload\.conversionRate\)/);
  assert.match(source, /dailyRegistrations: toArray\(payload\.dailyRegistrations\)\.map\(normalizeTimePoint\)/);
  assert.match(source, /aria-pressed=\{timeRange === val\}/);
  assert.match(source, /Could not load analytics/);
});

test('scanner does not dedupe failed same-payload retries before the API result is known', () => {
  const source = readPage('scanner/ScannerPage.jsx');
  const postIndex = source.indexOf("await api.post('/tickets/verify'");
  const assignmentIndex = source.indexOf('lastPayloadRef.current = normalizedQrData;', postIndex);

  assert.ok(postIndex > -1, 'scanner should post QR verification payloads');
  assert.ok(assignmentIndex > postIndex, 'successful API response should precede dedupe assignment');
  assert.match(source, /verifyTicket\(manualValue, \{ bypassDedupe: true \}\)/);
  assert.match(source, /setVerificationResult\(null\)/);
  assert.match(source, /lastPayloadRef\.current = ''/);
  assert.match(source, /role="alert"/);
});
