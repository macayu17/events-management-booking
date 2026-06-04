import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('registration cleanup only deletes unstarted unpaid drafts', () => {
  const cleanupSource = fs.readFileSync(path.resolve('src/services/registration-cleanup.service.js'), 'utf8');

  assert.match(cleanupSource, /status:\s*'PENDING'/);
  assert.match(cleanupSource, /status:\s*'CREATED'/);
  assert.match(cleanupSource, /providerOrderId:\s*null/);
  assert.match(cleanupSource, /ticket:\s*\{\s*is:\s*null\s*\}/);
});

test('free and RSVP registration completion failures trigger draft cleanup', () => {
  const routeSource = fs.readFileSync(path.resolve('src/routes/registration.routes.js'), 'utf8');

  assert.match(routeSource, /deleteUnstartedRegistrationDraft\(registration\.id\)/);
  assert.match(routeSource, /throw completionError/);
});

test('registration and waitlist capacity gates include active checkout holds', () => {
  const registrationRouteSource = fs.readFileSync(path.resolve('src/routes/registration.routes.js'), 'utf8');
  const waitlistRouteSource = fs.readFileSync(path.resolve('src/routes/waitlist.routes.js'), 'utf8');
  const featureRouteSource = fs.readFileSync(path.resolve('src/routes/feature.routes.js'), 'utf8');

  assert.match(registrationRouteSource, /countReservedEventCapacity\(id\)/);
  assert.match(registrationRouteSource, /countBlockingCheckoutHoldsForTicketTier\(selectedTier\.id\)/);
  assert.match(waitlistRouteSource, /countReservedEventCapacity\(id\)/);
  assert.match(featureRouteSource, /countBlockingCheckoutHoldsForTicketTier\(tier\.id\)/);
  assert.match(featureRouteSource, /reservedCount/);
  assert.match(featureRouteSource, /availableCount/);
});
