import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import prisma from '../config/db.js';
import { generateQRPayload } from '../utils/qr.util.js';
import { isCloudinaryConfigured, uploadPdfToCloudinary } from '../utils/cloudinary.util.js';
import { isR2Configured, uploadBufferToR2 } from '../utils/r2.util.js';
import { resolveLocalUploadPath } from '../utils/local-upload-path.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseQrPayloadSafe = (rawPayload) => {
  if (!rawPayload || typeof rawPayload !== 'string') return null;
  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
};

const hasUsableQrPayload = (payload, ticket, order) => {
  return Boolean(
    payload &&
    payload.ticketId === ticket.id &&
    payload.orderId === order.id &&
    payload.eventId === order.registration.event.id &&
    payload.sig
  );
};

const isUniqueConstraintError = (error) => error?.code === 'P2002';

async function ensureTicketWithQr(order) {
  let ticket = await prisma.ticket.findUnique({
    where: { orderId: order.id }
  });

  if (!ticket) {
    try {
      ticket = await prisma.ticket.create({
        data: {
          orderId: order.id,
          qrPayload: '{}',
          validUntil: order.registration.event.endTime
        }
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      ticket = await prisma.ticket.findUnique({
        where: { orderId: order.id }
      });

      if (!ticket) {
        throw error;
      }
    }
  }

  const parsedPayload = parseQrPayloadSafe(ticket.qrPayload);
  if (!hasUsableQrPayload(parsedPayload, ticket, order)) {
    const newPayload = generateQRPayload({
      ticketId: ticket.id,
      orderId: order.id,
      eventId: order.registration.event.id,
      registrationId: order.registrationId
    });

    ticket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { qrPayload: JSON.stringify(newPayload) }
    });
  }

  return ticket;
}

// ============== DESIGN CONSTANTS ==============
const TICKET_WIDTH = 595;  // A4 width in points
const TICKET_HEIGHT = 842; // A4 height in points
const MARGIN = 40;
const CONTENT_WIDTH = TICKET_WIDTH - (MARGIN * 2);

// Premium color palette
const COLORS = {
  darkBg: [15, 15, 20],
  cardBg: [25, 25, 35],
  gold: [212, 175, 55],
  goldLight: [255, 215, 100],
  white: [255, 255, 255],
  gray: [140, 140, 160],
  lightGray: [200, 200, 210],
  accent: [99, 102, 241], // Indigo
};

const safeDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const formatCurrency = (amountCents = 0, currency = 'INR') => {
  const amount = Number(amountCents || 0) / 100;
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;

  if (currency === 'INR') {
    return `INR ${amount.toFixed(fractionDigits)}`;
  }

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(fractionDigits)}`;
  }
};

const getTicketTier = (paymentData) => {
  if (!paymentData || typeof paymentData !== 'object' || Array.isArray(paymentData)) return null;
  return paymentData.ticketTier && typeof paymentData.ticketTier === 'object'
    ? paymentData.ticketTier
    : null;
};

export function buildTicketRenderModel(order, ticket) {
  const event = order.registration.event;
  const attendee = order.registration.formResponse || {};
  const ticketTier = getTicketTier(order.paymentData);
  const eventDate = safeDate(event.startTime);
  const issuedAt = safeDate(ticket.issuedAt);

  return {
    brand: 'Occasio',
    passType: 'ADMIT ONE',
    eventTitle: event.title || 'Event Ticket',
    dateLabel: eventDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).replace(/,\s*(\d{4})$/, ' $1'),
    timeLabel: eventDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    }),
    venue: event.location || 'Venue TBA',
    attendeeName: attendee.name || 'Guest',
    attendeeEmail: attendee.email || order.registration.userEmail || '-',
    attendeePhone: attendee.phone || attendee.phoneNumber || '',
    ticketCode: ticket.id.substring(0, 8).toUpperCase(),
    ticketId: ticket.id,
    orderCode: order.id.substring(0, 8).toUpperCase(),
    tierName: ticketTier?.name || (Number(order.amountCents || 0) === 0 ? 'Free Pass' : 'General Admission'),
    priceLabel: Number(order.amountCents || 0) === 0
      ? 'Free'
      : formatCurrency(order.amountCents, order.currency || event.currency || 'INR'),
    issuedLabel: issuedAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }),
  };
}

// ============== HELPER FUNCTIONS ==============
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
};

const MAX_TICKET_IMAGE_BYTES = 5 * 1024 * 1024;
const TICKET_IMAGE_TIMEOUT_MS = 2000;
const TICKET_IMAGE_CACHE_LIMIT = 40;
const TICKET_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ticketImageCache = new Map();

const getCachedTicketImage = (key) => {
  const buffer = ticketImageCache.get(key);
  if (!buffer) return null;
  ticketImageCache.delete(key);
  ticketImageCache.set(key, buffer);
  return buffer;
};

const rememberTicketImage = (key, buffer) => {
  if (!buffer || buffer.length > MAX_TICKET_IMAGE_BYTES) return buffer;
  ticketImageCache.set(key, buffer);
  while (ticketImageCache.size > TICKET_IMAGE_CACHE_LIMIT) {
    ticketImageCache.delete(ticketImageCache.keys().next().value);
  }
  return buffer;
};

const isAllowedTicketImageUrl = (value) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;

    if (url.hostname === 'res.cloudinary.com' || url.hostname.endsWith('.cloudinary.com')) {
      return true;
    }

    const bucket = process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    const allowedS3Hosts = new Set([
      bucket ? `${bucket}.s3.amazonaws.com` : null,
      bucket ? `${bucket}.s3.${region}.amazonaws.com` : null,
    ].filter(Boolean));

    return allowedS3Hosts.has(url.hostname);
  } catch {
    return false;
  }
};

const fetchRemoteTicketImage = async (url, redirectsRemaining = 2) => {
  if (!isAllowedTicketImageUrl(url)) return null;

  const parsedUrl = new URL(url);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const request = protocol.get(parsedUrl, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const nextUrl = response.headers.location ? new URL(response.headers.location, parsedUrl).toString() : null;
        if (!nextUrl || redirectsRemaining <= 0 || !isAllowedTicketImageUrl(nextUrl)) {
          resolve(null);
          return;
        }
        fetchRemoteTicketImage(nextUrl, redirectsRemaining - 1).then(resolve);
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        resolve(null);
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_TICKET_IMAGE_BYTES) {
          request.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(null));
    });

    request.setTimeout(TICKET_IMAGE_TIMEOUT_MS, () => {
      request.destroy();
      resolve(null);
    });
    request.on('error', () => resolve(null));
  });
};

// Fetch only server-owned images for ticket rendering.
const fetchImage = async (imageRef) => {
  if (!imageRef) return null;
  const value = String(imageRef).trim();

  if (value.startsWith('/uploads/')) {
    try {
      const localPath = resolveLocalUploadPath(value, { allowedExtensions: TICKET_IMAGE_EXTENSIONS });
      const stats = await fsp.stat(localPath);
      if (stats.size > MAX_TICKET_IMAGE_BYTES) return null;
      const cacheKey = `local:${value}:${stats.size}:${stats.mtimeMs}`;
      const cached = getCachedTicketImage(cacheKey);
      if (cached) return cached;
      const buffer = await fsp.readFile(localPath);
      return rememberTicketImage(cacheKey, buffer);
    } catch {
      return null;
    }
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const cacheKey = `remote:${value}`;
    const cached = getCachedTicketImage(cacheKey);
    if (cached) return cached;
    return rememberTicketImage(cacheKey, await fetchRemoteTicketImage(value));
  }

  return null;
};

// Draw rounded rectangle
const drawRoundedRect = (doc, x, y, width, height, radius, fill, stroke = null) => {
  doc.save();
  doc.moveTo(x + radius, y);
  doc.lineTo(x + width - radius, y);
  doc.quadraticCurveTo(x + width, y, x + width, y + radius);
  doc.lineTo(x + width, y + height - radius);
  doc.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  doc.lineTo(x + radius, y + height);
  doc.quadraticCurveTo(x, y + height, x, y + height - radius);
  doc.lineTo(x, y + radius);
  doc.quadraticCurveTo(x, y, x + radius, y);
  doc.closePath();

  if (fill) {
    doc.fill(fill);
  }
  if (stroke) {
    doc.lineWidth(stroke.width || 1).stroke(stroke.color);
  }
  doc.restore();
};

// Draw decorative pattern (subtle dots)
const drawPattern = (doc, x, y, width, height, color) => {
  doc.save();
  doc.opacity(0.03);
  for (let px = x; px < x + width; px += 20) {
    for (let py = y; py < y + height; py += 20) {
      doc.circle(px, py, 1).fill(color);
    }
  }
  doc.opacity(1);
  doc.restore();
};

// Draw perforated line
const drawPerforatedLine = (doc, x1, y, x2, color) => {
  doc.save();
  doc.lineWidth(1);
  doc.dash(5, { space: 5 });
  doc.moveTo(x1, y).lineTo(x2, y).stroke(color);
  doc.undash();
  doc.restore();
};

// Draw semi-circle cutouts (ticket stub effect)
const drawCutouts = (doc, y, bgColor) => {
  const cutoutRadius = 15;
  doc.save();
  // Left cutout
  doc.circle(MARGIN - 5, y, cutoutRadius).fill(bgColor);
  // Right cutout
  doc.circle(TICKET_WIDTH - MARGIN + 5, y, cutoutRadius).fill(bgColor);
  doc.restore();
};

// ============== TICKET RECORD ==============
export async function createTicketRecord(order) {
  try {
    return await ensureTicketWithQr(order);
  } catch (error) {
    console.error('Create ticket record error:', error);
    throw error;
  }
}

// ============== PREMIUM TICKET DESIGN ==============
async function drawPremiumTicket(doc, ticket, order, qrCodeBuffer) {
  const event = order.registration.event;
  const ticketStyle = event.ticketStyle || {};
  const model = buildTicketRenderModel(order, ticket);

  const allowedFonts = ['Helvetica', 'Times-Roman', 'Courier'];
  const requestedFont = ticketStyle.fontFamily || 'Helvetica';
  const fontFamily = allowedFonts.includes(requestedFont) ? requestedFont : 'Helvetica';
  const fontBold = fontFamily === 'Times-Roman' ? 'Times-Bold' :
    fontFamily === 'Courier' ? 'Courier-Bold' : 'Helvetica-Bold';

  const primaryColor = ticketStyle.primaryColor || '#E23744';
  const primaryRgb = hexToRgb(primaryColor);
  const ink = '#16110f';
  const paper = '#f6eee3';
  const cream = '#fff9ef';
  const muted = '#7e746b';
  const line = '#e7d8c6';
  const dark = '#0b0b0d';
  const showQR = ticketStyle.showQR !== false;
  const showLogo = ticketStyle.showLogo !== false;
  const posterImage = await fetchImage(event.posterUrl || ticketStyle.headerImage);

  doc.rect(0, 0, TICKET_WIDTH, TICKET_HEIGHT).fill(paper);
  doc.save().opacity(0.16);
  doc.circle(82, 104, 190).fill(primaryColor);
  doc.circle(TICKET_WIDTH - 30, TICKET_HEIGHT - 80, 210).fill('#d9c6b1');
  doc.restore();
  drawPattern(doc, 0, 0, TICKET_WIDTH, TICKET_HEIGHT, '#7d6a59');

  const cardX = 42;
  const cardY = 42;
  const cardWidth = TICKET_WIDTH - 84;
  const cardHeight = 758;
  const radius = 30;

  drawRoundedRect(doc, cardX + 8, cardY + 10, cardWidth, cardHeight, radius, '#d9cbb9');
  drawRoundedRect(doc, cardX, cardY, cardWidth, cardHeight, radius, cream);
  drawRoundedRect(doc, cardX + 1.5, cardY + 1.5, cardWidth - 3, cardHeight - 3, radius - 2, null, { color: primaryRgb, width: 1.5 });

  const bandW = 68;
  doc.save();
  drawRoundedRect(doc, cardX, cardY, bandW, cardHeight, radius, dark);
  doc.clip();
  doc.rect(cardX + bandW - 22, cardY, 22, cardHeight).fill(primaryColor);
  doc.restore();
  doc.save();
  doc.rotate(-90, { origin: [cardX + 34, cardY + cardHeight / 2] });
  doc.font(fontBold).fontSize(17).fillColor('#fff7eb')
    .text(model.brand.toUpperCase(), cardX - 278, cardY + cardHeight / 2 - 8, {
      width: 560,
      align: 'center',
      characterSpacing: 5
    });
  doc.restore();

  const contentX = cardX + bandW + 26;
  const contentY = cardY + 28;
  const contentW = cardWidth - bandW - 52;

  doc.font(fontBold).fontSize(9).fillColor(primaryColor)
    .text(model.passType, contentX, contentY, { characterSpacing: 2.8 });
  doc.font(fontBold).fontSize(10).fillColor(muted)
    .text(model.ticketCode, contentX + contentW - 110, contentY, {
      width: 110,
      align: 'right',
      characterSpacing: 1.3
    });

  const heroX = contentX;
  const heroY = contentY + 30;
  const heroW = contentW;
  const heroH = 238;

  doc.save();
  drawRoundedRect(doc, heroX, heroY, heroW, heroH, 24, '#1b1513');
  doc.clip();
  if (posterImage) {
    try {
      doc.image(posterImage, heroX, heroY, {
        cover: [heroW, heroH],
        align: 'center',
        valign: 'center'
      });
    } catch {
      doc.rect(heroX, heroY, heroW, heroH).fill('#231d1a');
    }
  } else {
    doc.rect(heroX, heroY, heroW, heroH).fill('#231d1a');
  }
  doc.save();
  doc.opacity(0.58);
  doc.rect(heroX, heroY, heroW, heroH).fill([0, 0, 0]);
  doc.restore();
  doc.save().opacity(0.3);
  doc.rect(heroX, heroY + heroH - 92, heroW, 92).fill(primaryColor);
  doc.restore();
  doc.restore();

  doc.font(fontBold).fontSize(11).fillColor('#fff4e8')
    .text(model.dateLabel.toUpperCase(), heroX + 22, heroY + 24, { characterSpacing: 1.5 });
  fitText(doc, model.eventTitle, heroX + 22, heroY + 124, heroW - 44, 74, {
    font: fontBold,
    size: 33,
    minSize: 22,
    color: '#fff9ef',
    lineGap: -1
  });

  const metaY = heroY + heroH + 20;
  const metaGap = 12;
  const metaW = (heroW - metaGap) / 2;
  drawInfoBlock(doc, heroX, metaY, metaW, 'DATE & TIME', `${model.dateLabel}\n${model.timeLabel}`, fontFamily, fontBold, primaryColor, ink, muted);
  drawInfoBlock(doc, heroX + metaW + metaGap, metaY, metaW, 'VENUE', model.venue, fontFamily, fontBold, primaryColor, ink, muted);

  const mainY = metaY + 106;
  const qrSize = 146;
  const qrBox = qrSize + 28;
  const detailsX = showQR ? heroX + qrBox + 24 : heroX;
  const detailsW = showQR ? heroW - qrBox - 24 : heroW;

  if (showQR) {
    drawRoundedRect(doc, heroX, mainY, qrBox, qrBox, 24, '#ffffff');
    drawRoundedRect(doc, heroX + 7, mainY + 7, qrBox - 14, qrBox - 14, 18, null, { color: primaryRgb, width: 2 });
    try {
      doc.image(qrCodeBuffer, heroX + 14, mainY + 14, { width: qrSize, height: qrSize });
    } catch {
      doc.font(fontBold).fontSize(18).fillColor('#202020').text('QR', heroX + 66, mainY + 72);
    }
    doc.font(fontBold).fontSize(8).fillColor(muted)
      .text('SCAN AT ENTRY', heroX, mainY + qrBox + 10, { width: qrBox, align: 'center', characterSpacing: 1.5 });
  }

  doc.font(fontBold).fontSize(9).fillColor(primaryColor)
    .text('TICKET NUMBER', detailsX, mainY + 2, { characterSpacing: 1.6 });
  doc.font('Courier-Bold').fontSize(25).fillColor(ink)
    .text(model.ticketCode, detailsX, mainY + 22, { width: detailsW });

  drawMiniDivider(doc, detailsX, mainY + 68, detailsW);

  doc.font(fontBold).fontSize(8).fillColor(muted)
    .text('ATTENDEE', detailsX, mainY + 88, { characterSpacing: 1.2 });
  fitText(doc, model.attendeeName, detailsX, mainY + 106, detailsW, 26, {
    font: fontBold,
    size: 18,
    minSize: 12,
    color: ink
  });
  doc.font(fontFamily).fontSize(9.5).fillColor(muted)
    .text(model.attendeeEmail, detailsX, mainY + 134, { width: detailsW, height: 16, ellipsis: true });

  const pillY = mainY + 162;
  drawPill(doc, detailsX, pillY, detailsW, model.tierName, model.priceLabel, fontFamily, fontBold, primaryColor, ink);

  const tearY = mainY + qrBox + 52;
  drawCutouts(doc, tearY, paper);
  drawPerforatedLine(doc, cardX + 28, tearY, cardX + cardWidth - 28, '#c8b9a8');

  const stubY = tearY + 26;
  drawRoundedRect(doc, heroX, stubY, heroW, 88, 20, '#17110f');
  doc.font(fontBold).fontSize(8).fillColor(primaryColor)
    .text('ENTRY INSTRUCTIONS', heroX + 20, stubY + 18, { characterSpacing: 1.8 });
  doc.font(fontFamily).fontSize(9.5).fillColor('#f4e8db')
    .text('Keep this pass ready at the gate. The QR code is valid for one attendee and one entry only.', heroX + 20, stubY + 38, {
      width: heroW - 165,
      lineGap: 2
    });
  doc.font(fontBold).fontSize(8).fillColor('#9e9286')
    .text('ORDER', heroX + heroW - 118, stubY + 24, { width: 92, align: 'right', characterSpacing: 1.2 });
  doc.font('Courier-Bold').fontSize(16).fillColor('#fff7eb')
    .text(model.orderCode, heroX + heroW - 118, stubY + 42, { width: 92, align: 'right' });

  if (showLogo) {
    doc.font(fontBold).fontSize(13).fillColor(primaryColor)
      .text(model.brand, 0, TICKET_HEIGHT - 36, { width: TICKET_WIDTH, align: 'center' });
  }

  doc.font(fontFamily).fontSize(8).fillColor(muted)
    .text(`Issued ${model.issuedLabel}`, 0, TICKET_HEIGHT - 20, {
      width: TICKET_WIDTH,
      align: 'center'
    });
}

function drawInfoBlock(doc, x, y, width, label, value, fontFamily, fontBold, primaryColor, accentColor, muted) {
  drawRoundedRect(doc, x, y, width, 84, 18, '#fffdf8');
  drawRoundedRect(doc, x + 0.8, y + 0.8, width - 1.6, 82.4, 17, null, { color: '#eadccb', width: 0.8 });
  doc.font(fontBold).fontSize(8).fillColor(primaryColor)
    .text(label, x + 16, y + 15, { width: width - 32, characterSpacing: 1.4 });
  doc.font(fontBold).fontSize(11.5).fillColor(accentColor)
    .text(value, x + 16, y + 36, { width: width - 32, height: 34, lineGap: 2, ellipsis: true });
  doc.font(fontFamily).fontSize(1).fillColor(muted);
}

function drawMiniDivider(doc, x, y, width) {
  doc.save();
  doc.lineWidth(0.8).strokeColor('#e3d5c4');
  doc.moveTo(x, y).lineTo(x + width, y).stroke();
  doc.restore();
}

function fitText(doc, text, x, y, width, maxHeight, options) {
  let size = options.size;
  while (size > options.minSize) {
    doc.font(options.font).fontSize(size);
    if (doc.heightOfString(text, { width, lineGap: options.lineGap || 0 }) <= maxHeight) break;
    size -= 1;
  }

  doc.font(options.font).fontSize(size).fillColor(options.color)
    .text(text, x, y, {
      width,
      height: maxHeight,
      lineGap: options.lineGap || 0,
      ellipsis: true
    });
}

function drawPill(doc, x, y, width, leftText, rightText, fontFamily, fontBold, primaryColor, ink) {
  drawRoundedRect(doc, x, y, width, 42, 21, '#fffdf8');
  drawRoundedRect(doc, x + 0.7, y + 0.7, width - 1.4, 40.6, 20, null, { color: '#eadccb', width: 0.8 });
  doc.font(fontBold).fontSize(8).fillColor(primaryColor)
    .text('PASS TYPE', x + 16, y + 9, { width: width / 2 - 20, characterSpacing: 1.2 });
  doc.font(fontBold).fontSize(12).fillColor(ink)
    .text(leftText, x + 16, y + 23, { width: width / 2 - 20, height: 22, ellipsis: true });
  doc.font(fontFamily).fontSize(8).fillColor('#7e746b')
    .text('PRICE', x + width / 2, y + 9, { width: width / 2 - 16, align: 'right', characterSpacing: 1.2 });
  doc.font(fontBold).fontSize(12).fillColor(ink)
    .text(rightText, x + width / 2, y + 23, { width: width / 2 - 16, height: 16, align: 'right', ellipsis: true });
}

export async function renderTicketPDFBuffer(order, ticket) {
  const qrCodeBuffer = await QRCode.toBuffer(ticket.qrPayload, {
    width: 300,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  });

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: false });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  return await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    drawPremiumTicket(doc, ticket, order, qrCodeBuffer)
      .then(() => doc.end())
      .catch(reject);
  });
}

// ============== MAIN EXPORT FUNCTIONS ==============
export async function generateTicketPDF(order) {
  try {
    let ticket = await ensureTicketWithQr(order);

    const pdfBuffer = await renderTicketPDFBuffer(order, ticket);

    // Upload to R2
    let ticketPdfUrl = null;
    if (isR2Configured()) {
      try {
        const key = `tickets/${order.registration.event.id}/${ticket.id}.pdf`;
        ticketPdfUrl = await uploadBufferToR2({
          buffer: pdfBuffer,
          key,
          contentType: 'application/pdf',
        });
      } catch (uploadError) {
        console.error('R2 upload failed:', uploadError);
      }
    }

    // Fallback to Cloudinary
    if (!ticketPdfUrl && isCloudinaryConfigured()) {
      try {
        console.log('Uploading ticket PDF to Cloudinary...');
        ticketPdfUrl = await uploadPdfToCloudinary(pdfBuffer, 'tickets');
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
      }
    }

    // Fallback to local save
    if (!ticketPdfUrl) {
      const uploadDir = path.join(__dirname, '../../uploads/tickets');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filename = `ticket-${ticket.id}.pdf`;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, pdfBuffer);
      ticketPdfUrl = `/uploads/tickets/${filename}`;
    }

    ticket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { ticketPdfUrl }
    });

    return ticket;
  } catch (error) {
    console.error('Generate ticket error:', error);
    throw error;
  }
}

export async function generateTicketPDFBuffer(order) {
  try {
    const ticket = await ensureTicketWithQr(order);
    return await renderTicketPDFBuffer(order, ticket);
  } catch (error) {
    console.error('Generate PDF buffer error:', error);
    throw error;
  }
}
