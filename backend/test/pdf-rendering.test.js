import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFKitDocument from 'pdfkit';
import { PDFDocument as PdfLibDocument } from 'pdf-lib';
import { normalizeCertificateMapping } from '../src/services/certificate.service.js';
import { buildTicketRenderModel, renderTicketPDFBuffer } from '../src/services/ticket.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ticketServicePath = path.resolve(__dirname, '../src/services/ticket.service.js');

const sampleEvent = {
  id: 'event-1',
  title: 'Occasio Launch Night',
  location: 'The Grand Hall, Bengaluru',
  startTime: new Date('2026-08-15T12:00:00.000Z'),
  endTime: new Date('2026-08-15T15:00:00.000Z'),
  currency: 'INR',
  ticketStyle: {
    primaryColor: '#E23744',
    accentColor: '#fff4e6',
    backgroundColor: '#070707',
  },
};

const sampleOrder = {
  id: 'order-1',
  amountCents: 49900,
  currency: 'INR',
  registrationId: 'registration-1',
  paymentData: {
    ticketTier: {
      id: 'tier-vip',
      name: 'VIP Access',
      priceCents: 49900,
    },
  },
  registration: {
    userEmail: 'aarav@example.com',
    formResponse: {
      name: 'Aarav Mehta',
      email: 'aarav@example.com',
      phone: '9999999999',
    },
    event: sampleEvent,
  },
};

const sampleTicket = {
  id: '91ce8539-087b-4abc-9a9a-de0448669607',
  qrPayload: JSON.stringify({ ticketId: '91ce8539-087b-4abc-9a9a-de0448669607', sig: 'signed' }),
  issuedAt: new Date('2026-07-20T10:00:00.000Z'),
};

test('certificate generation uses a sensible default mapping when no fields are placed', () => {
  const mapping = normalizeCertificateMapping([]);

  assert.deepEqual(
    mapping.map((field) => field.fieldId),
    ['certificateType', 'userName', 'eventName', 'date', 'qrCode']
  );
  assert.equal(mapping.find((field) => field.fieldId === 'userName').bold, true);
  assert.equal(mapping.find((field) => field.fieldId === 'userName').fontSize > 24, true);
});

test('ticket render model exposes polished pass metadata', () => {
  const model = buildTicketRenderModel(sampleOrder, sampleTicket);

  assert.equal(model.brand, 'Occasio');
  assert.equal(model.attendeeName, 'Aarav Mehta');
  assert.equal(model.attendeeEmail, 'aarav@example.com');
  assert.equal(model.ticketCode, '91CE8539');
  assert.equal(model.tierName, 'VIP Access');
  assert.equal(model.priceLabel, 'INR 499');
  assert.match(model.dateLabel, /Sat, 15 Aug 2026/);
});

test('ticket renderer creates a substantial one-page branded PDF without database access', async () => {
  const buffer = await renderTicketPDFBuffer(sampleOrder, sampleTicket);
  const pdf = await PdfLibDocument.load(buffer);

  assert.equal(buffer.slice(0, 4).toString(), '%PDF');
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(buffer.length > 18000, true);
});

test('ticket renderer constrains variable text blocks before drawing', async () => {
  const longOrder = {
    ...sampleOrder,
    id: 'order-long-content',
    amountCents: 999900,
    paymentData: {
      ticketTier: {
        id: 'tier-long',
        name: 'VIP Access With Very Long Premium Tier Name That Can Overflow',
        priceCents: 999900,
      },
    },
    registration: {
      ...sampleOrder.registration,
      userEmail: 'avery.long.attendee.email.address.for.ticket.testing@example-very-long-domain.com',
      formResponse: {
        name: 'Dr. A Very Very Long Attendee Name That Should Never Break The Ticket Layout',
        email: 'avery.long.attendee.email.address.for.ticket.testing@example-very-long-domain.com',
        phone: '9999999999',
      },
      event: {
        ...sampleEvent,
        title: 'International Enterprise Operations Summit For Extremely Long Event Titles That Previously Overflowed Across Ticket Components',
        location: 'A very long venue location with multiple halls, floors, gate names, landmark descriptions, and city information that can overflow badly',
      },
    },
  };

  const textCalls = [];
  const originalText = PDFKitDocument.prototype.text;
  const getOptions = (x, y, options) => {
    if (options && typeof options === 'object') return options;
    if (y && typeof y === 'object') return y;
    if (x && typeof x === 'object') return x;
    return {};
  };

  PDFKitDocument.prototype.text = function textWithSpy(text, x, y, options) {
    if (typeof text === 'string') {
      textCalls.push({ text, options: getOptions(x, y, options) });
    }
    return originalText.apply(this, arguments);
  };

  try {
    const buffer = await renderTicketPDFBuffer(longOrder, sampleTicket);
    const pdf = await PdfLibDocument.load(buffer);

    assert.equal(buffer.slice(0, 4).toString(), '%PDF');
    assert.equal(pdf.getPageCount(), 1);
  } finally {
    PDFKitDocument.prototype.text = originalText;
  }

  const optionsFor = (prefix) => textCalls.find((call) => call.text.startsWith(prefix))?.options;

  assert.equal(optionsFor('International Enterprise Operations Summit')?.height, 74);
  assert.equal(optionsFor('A very long venue location')?.height, 34);
  assert.equal(optionsFor('Dr. A Very Very Long Attendee')?.height, 26);
  assert.equal(optionsFor('avery.long.attendee.email.address')?.height, 16);
  assert.equal(optionsFor('VIP Access With Very Long')?.height, 22);
});

test('ticket renderer keeps source checks independent of the test working directory', () => {
  const source = fs.readFileSync(ticketServicePath, 'utf8');

  assert.match(source, /height:\s*maxHeight/);
  assert.match(source, /TICKET_IMAGE_TIMEOUT_MS\s*=\s*2000/);
  assert.match(source, /ticketImageCache/);
});

test('certificate renderer can embed uploaded custom font refs', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/certificate.service.js'), 'utf8');

  assert.match(source, /@pdf-lib\/fontkit/);
  assert.match(source, /registerFontkit\(fontkit\)/);
  assert.match(source, /Helvetica Bold Oblique/);
  assert.match(source, /Courier Bold Oblique/);
  assert.match(source, /fontRef/);
  assert.match(source, /certificates\/fonts/);
});
