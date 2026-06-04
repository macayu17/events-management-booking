import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('registration deletion guard selects payment-start fields it checks', () => {
  const source = fs.readFileSync(path.resolve('src/routes/admin.routes.js'), 'utf8');
  const deleteRouteStart = source.indexOf("router.delete('/registrations/:regId'");
  const deleteRouteEnd = source.indexOf('// Dashboard analytics', deleteRouteStart);
  const deleteRoute = source.slice(deleteRouteStart, deleteRouteEnd);

  assert.notEqual(deleteRouteStart, -1);
  assert.match(deleteRoute, /providerOrderId:\s*true/);
  assert.match(deleteRoute, /amountCents:\s*true/);
  assert.match(deleteRoute, /order\.providerOrderId/);
  assert.match(deleteRoute, /order\.amountCents > 0/);
});

test('admin attendees route applies ticket status filters in the database query', () => {
  const source = fs.readFileSync(path.resolve('src/routes/admin.routes.js'), 'utf8');
  const attendeesRouteStart = source.indexOf("router.get('/events/:id/attendees'");
  const attendeesRouteEnd = source.indexOf('// Get check-in stats', attendeesRouteStart);
  const attendeesRoute = source.slice(attendeesRouteStart, attendeesRouteEnd);

  assert.notEqual(attendeesRouteStart, -1);
  assert.match(attendeesRoute, /buildAttendeeOrderWhere\(status\)/);
  assert.match(attendeesRoute, /where:\s*orderWhere/);
  assert.doesNotMatch(attendeesRoute, /ticket:\s*\{\s*where:/);
});

test('admin event detail payload requires edit-capable team roles', () => {
  const source = fs.readFileSync(path.resolve('src/routes/admin.routes.js'), 'utf8');
  const eventDetailStart = source.indexOf("router.get('/events/:id'");
  const eventDetailEnd = source.indexOf('// Get registrations for an event', eventDetailStart);
  const eventDetailRoute = source.slice(eventDetailStart, eventDetailEnd);

  assert.notEqual(eventDetailStart, -1);
  assert.match(eventDetailRoute, /checkEventAccess\(req\.user,\s*id,\s*\['MANAGER', 'SUPER_MANAGER'\]\)/);
});

test('admin analytics derives failed registrations from failed orders', () => {
  const source = fs.readFileSync(path.resolve('src/routes/admin.routes.js'), 'utf8');
  const analyticsStart = source.indexOf("router.get('/events/:id/analytics'");
  const analyticsEnd = source.indexOf('// Broadcast email', analyticsStart);
  const analyticsRoute = source.slice(analyticsStart, analyticsEnd);

  assert.notEqual(analyticsStart, -1);
  assert.match(analyticsRoute, /summarizeRegistrationStatuses\(registrations\)/);
  assert.doesNotMatch(analyticsRoute, /r\.status === 'FAILED'/);
});

test('admin event create and update paths parse integer fields before Prisma writes', () => {
  const source = fs.readFileSync(path.resolve('src/routes/admin.routes.js'), 'utf8');
  const createRouteStart = source.indexOf("router.post('/events'");
  const createRouteEnd = source.indexOf('// Update event', createRouteStart);
  const createRoute = source.slice(createRouteStart, createRouteEnd);

  assert.notEqual(createRouteStart, -1);
  assert.match(source, /const raw = typeof value === 'number' \? String\(value\) : value\.trim\(\)/);
  assert.ok(source.includes("if (!/^-?\\d+$/.test(raw)) {"));
  assert.match(createRoute, /capacity: parseIntegerField\(req\.body\.capacity,\s*'capacity',\s*1\)/);
  assert.match(createRoute, /priceCents: parseIntegerField\(req\.body\.priceCents,\s*'priceCents',\s*0\)/);
  assert.doesNotMatch(createRoute, /\n\s*capacity,\n/);
  assert.doesNotMatch(createRoute, /\n\s*priceCents,\n/);
});
