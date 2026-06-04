import nodemailer from 'nodemailer';
import axios from 'axios';
import prisma from '../config/db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { escapeHtml, escapeHtmlWithLineBreaks, sanitizeBasicHtml, sanitizeEmailSubject } from '../utils/html.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to fetch PDF as buffer for email attachment
async function fetchPdfAsBuffer(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.warn('Failed to fetch PDF from URL:', error.message);
    return null;
  }
}

let transporter = null;
let verificationStarted = false;

const isPresent = (value) => typeof value === 'string' && value.trim().length > 0;

export function isEmailDeliveryConfigured() {
  return Boolean(
    isPresent(process.env.SMTP_HOST) &&
    isPresent(process.env.SMTP_PORT) &&
    isPresent(process.env.SMTP_USER) &&
    isPresent(process.env.SMTP_PASS)
  );
}

function getTransporter() {
  if (!isEmailDeliveryConfigured()) {
    const error = new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
    error.statusCode = 503;
    throw error;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  if (!verificationStarted) {
    verificationStarted = true;
    transporter.verify((error) => {
      if (error) {
        console.error('Email transporter error:', error.message);
      } else {
        console.log('Email server is ready');
      }
    });
  }

  return transporter;
}

export async function sendTicketEmail(ticketId, email) {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        order: {
          include: {
            registration: {
              include: {
                event: true
              }
            }
          }
        }
      }
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const event = ticket.order.registration.event;
    const attendee = ticket.order.registration.formResponse;

    // Generate PDF buffer directly (bypass Cloudinary)
    let attachments = [];
    try {
      const { generateTicketPDFBuffer } = await import('./ticket.service.js');
      const pdfBuffer = await generateTicketPDFBuffer(ticket.order);
      if (pdfBuffer) {
        attachments.push({
          filename: `ticket-${ticket.id.substring(0, 8)}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        });
        console.log('PDF attachment generated successfully');
      }
    } catch (pdfError) {
      console.warn('Could not generate PDF attachment:', pdfError.message);
      // Continue without attachment
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: sanitizeEmailSubject(`Your Ticket for ${event.title}`),
      html: generateEmailHTML(event, attendee, ticket),
      attachments
    };

    const info = await getTransporter().sendMail(mailOptions);
    console.log('Email sent:', info.messageId);

    return info;
  } catch (error) {
    console.error('Send email error:', error);
    throw error;
  }
}

export function generateEmailHTML(event, attendee, ticket) {
  const attendeeName = escapeHtml(attendee.name || 'there');
  const eventTitle = escapeHtml(event.title);
  const eventLocation = escapeHtml(event.location);
  const eventStartTime = escapeHtml(new Date(event.startTime).toLocaleString());
  const ticketShortId = escapeHtml(ticket.id.substring(0, 8).toUpperCase());

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .event-details {
          background: white;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .detail-row {
          padding: 10px 0;
          border-bottom: 1px solid #eee;
        }
        .detail-label {
          font-weight: bold;
          color: #667eea;
          display: inline-block;
          width: 120px;
        }
        .cta-button {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          text-align: center;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 2px solid #eee;
          color: #999;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎉 Your Ticket is Ready!</h1>
        <p>Get ready for an amazing experience</p>
      </div>

      <div class="content">
        <p>Hi ${attendeeName},</p>

        <p>Thank you for registering! Your ticket for <strong>${eventTitle}</strong> has been confirmed.</p>

        <div class="event-details">
          <h3>Event Details</h3>
          <div class="detail-row">
            <span class="detail-label">Event:</span>
            <span>${eventTitle}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Location:</span>
            <span>${eventLocation}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Date & Time:</span>
            <span>${eventStartTime}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Ticket ID:</span>
            <span>${ticketShortId}</span>
          </div>
        </div>

        <p><strong>Important:</strong> Your ticket is attached to this email as a PDF. Please download and save it. You'll need to present the QR code at the venue entrance.</p>

        <p style="margin-top: 30px;">We look forward to seeing you at the event!</p>

        <div class="footer">
          <p>If you have any questions, please contact us at support@eventmanagement.com</p>
          <p style="margin-top: 10px;">This is an automated email. Please do not reply to this message.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendWelcomeEmail(email, name) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Welcome to Event Management System',
    html: `
      <h1>Welcome, ${escapeHtml(name)}!</h1>
      <p>Thank you for joining our event management platform.</p>
      <p>You can now start exploring and registering for amazing events!</p>
    `
  };

  return getTransporter().sendMail(mailOptions);
}

export async function sendCustomEmail(to, subject, html) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to, // Can be array or single string
    subject: sanitizeEmailSubject(subject),
    html: sanitizeBasicHtml(html)
  };

  return getTransporter().sendMail(mailOptions);
}

export async function sendTextEmail(to, subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: sanitizeEmailSubject(subject),
    html: `<p>${escapeHtmlWithLineBreaks(text)}</p>`
  };

  return getTransporter().sendMail(mailOptions);
}

export function generateCertificateEmailHTML(userName, eventName, certificateType = 'Participation') {
  const safeUserName = escapeHtml(userName);
  const safeEventName = escapeHtml(eventName);
  const safeCertificateType = escapeHtml(certificateType);

  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Hi ${safeUserName},</h1>
          <p>Thank you for being part of <strong>${safeEventName}</strong>.</p>
          <p>Please find your <strong>Certificate of ${safeCertificateType}</strong> attached to this email.</p>
          <br>
          <p>Best regards,<br>The Occasio Team</p>
        </div>
      `;
}

export async function sendCertificateEmail(toEmail, userName, eventName, pdfBuffer, certificateType = 'Participation') {
  try {
    await getTransporter().sendMail({
      from: `"Occasio Events" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@occasio.io'}>`,
      to: toEmail,
      subject: sanitizeEmailSubject(`Certificate of ${certificateType} - ${eventName}`),
      html: generateCertificateEmailHTML(userName, eventName, certificateType),
      attachments: [
        {
          filename: `${sanitizeEmailSubject(certificateType, 'Certificate')} Certificate - ${sanitizeEmailSubject(eventName, 'Event')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });
    console.log(`${certificateType} certificate sent to ${toEmail}`);
  } catch (error) {
    console.error('Certificate email send error:', error.message);
    throw error; // Re-throw so caller can track failures
  }
}
