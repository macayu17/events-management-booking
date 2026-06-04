import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCertificateEmailHTML, generateEmailHTML } from '../src/services/email.service.js';
import { escapeHtmlWithLineBreaks, sanitizeBasicHtml, sanitizeEmailSubject } from '../src/utils/html.util.js';

test('ticket email template escapes attendee and event fields', () => {
  const html = generateEmailHTML(
    {
      title: '<img src=x onerror=alert(1)> Launch & "Learn"',
      location: '<script>alert(2)</script> Hall',
      startTime: '2026-06-03T10:00:00.000Z',
    },
    { name: 'Tom & <b>Jerry</b>' },
    { id: '<script>bad</script>-ticket-id' }
  );

  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /Tom &amp; &lt;b&gt;Jerry&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; Launch &amp; &quot;Learn&quot;/);
});

test('certificate email template escapes names and certificate labels', () => {
  const html = generateCertificateEmailHTML(
    '<img src=x onerror=alert(1)>',
    'Event <script>alert(2)</script>',
    'Winner & <b>Rank</b>'
  );

  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /Winner &amp; &lt;b&gt;Rank&lt;\/b&gt;/);
});

test('basic HTML sanitizer preserves safe tags and removes dangerous attributes', () => {
  const html = sanitizeBasicHtml(`
    Plain Tom & Jerry
    <p>Hello <strong>team</strong></p>
    <img src=x onerror=alert(1)>
    <p><strong><script>alert(3)</script>Launch</strong></p>
    <a href="javascript:alert(1)" onclick="alert(2)">bad link</a>
    <a href="https://example.com?a=1&b=2">safe link</a>
  `);

  assert.match(html, /Plain Tom &amp; Jerry/);
  assert.match(html, /<p>Hello <strong>team<\/strong><\/p>/);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('onerror='), false);
  assert.equal(html.includes('onclick='), false);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /<p><strong>alert\(3\)Launch<\/strong><\/p>/);
  assert.match(html, /<a>bad link<\/a>/);
  assert.match(html, /<a href="https:\/\/example\.com\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">safe link<\/a>/);
});

test('plain text email helpers escape text and normalize subjects', () => {
  assert.equal(
    escapeHtmlWithLineBreaks('Hi <b>there</b>\nLine 2 & more'),
    'Hi &lt;b&gt;there&lt;/b&gt;<br>Line 2 &amp; more'
  );

  assert.equal(
    sanitizeEmailSubject('Reminder\r\nBCC: attacker@example.com'),
    'Reminder BCC: attacker@example.com'
  );
});
