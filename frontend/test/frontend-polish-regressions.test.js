import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readSource = (file) => fs.readFileSync(path.resolve('src', file), 'utf8');

test('event control avoids duplicate desktop navigation and handles long titles', () => {
  const source = readSource('pages/admin/EventControlPage.jsx');

  assert.match(source, /pb-4 md:pb-\[calc\(10rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(source, /sm:flex-row sm:items-center sm:justify-between/);
  assert.match(source, /<h1 className="break-words text-2xl font-bold text-white">/);
  assert.match(source, /className="[^"]*md:hidden"[\s\S]*role="tablist"/);
  assert.match(source, /hidden w-\[min\(760px,calc\(100vw-2rem\)\)\].*md:block/);
});

test('ticket style preview uses current event data instead of generic mock content', () => {
  const source = readSource('pages/admin/EventControlPage.jsx');

  assert.match(source, /<TicketStyleTab eventId=\{eventId\} event=\{event\}/);
  assert.match(source, /const previewTitle = event\?\.title \|\| 'Event name'/);
  assert.match(source, /const previewVenue = event\?\.location \|\| 'Venue to be announced'/);
  assert.doesNotMatch(source, /Tech Summit 2026/);
  assert.doesNotMatch(source, /Convention Center/);
  assert.doesNotMatch(source, /John Doe/);
});

test('registration sidebar renders meaningful poster images and wraps long copy', () => {
  const source = readSource('pages/public/RegistrationPage.jsx');

  assert.match(source, /<img[\s\S]*alt=\{`\$\{event\.title\} poster`\}/);
  assert.match(source, /className="break-words text-balance text-4xl/);
  assert.match(source, /className="mt-1 break-words font-bold text-\[#f7efe3\]"/);
  assert.doesNotMatch(source, /backgroundImage: `url\(\$\{posterImage\}\)`/);
});

test('registration ticket tiers use held-capacity availability from the API', () => {
  const source = readSource('pages/public/RegistrationPage.jsx');

  assert.match(source, /tier\.reservedCount \?\? tier\.soldCount/);
  assert.match(source, /tier\.availableCount \?\?/);
  assert.match(source, /remainingCount <= 0/);
});

test('poll cards wrap long questions and options without raw separator text', () => {
  const source = readSource('pages/admin/event-control/PollsTab.jsx');

  assert.match(source, /flex min-w-0 flex-col gap-3 sm:flex-row/);
  assert.match(source, /break-words text-lg font-bold text-white/);
  assert.match(source, /className="h-1 w-1 rounded-full bg-gray-600"/);
  assert.match(source, /<span className="min-w-0 break-words">\{opt\.text\}<\/span>/);
  assert.doesNotMatch(source, />\*<\/span>/);
});

test('certificate preview placement surface supports keyboard placement', () => {
  const source = readSource('components/CertificateDesigner.jsx');

  assert.match(source, /const handlePdfKeyDown = \(event\) =>/);
  assert.match(source, /ArrowUp: \[0\.5, 0\.2\]/);
  assert.match(source, /onKeyDown=\{handlePdfKeyDown\}/);
  assert.match(source, /role="button"/);
  assert.match(source, /tabIndex=\{0\}/);
});

test('shared visual shell avoids arbitrary top z-indexes and broad global transitions', () => {
  const css = readSource('index.css');
  const confirmDialog = readSource('components/ConfirmDialog.jsx');
  const eventList = readSource('pages/admin/EventListPage.jsx');
  const publicLayout = readSource('layouts/PublicLayout.jsx');

  assert.doesNotMatch(confirmDialog, /z-\[9999\]/);
  assert.doesNotMatch(eventList, /z-\[9999\]/);
  assert.match(publicLayout, /<main id="main-content" className="relative z-10/);
  assert.match(publicLayout, /<footer className="relative z-10/);
  assert.match(css, /transition-\[background-color,border-color,color,box-shadow,transform\]/);
  assert.doesNotMatch(css, /transition-all/);
});
