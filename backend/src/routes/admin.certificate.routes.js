import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/db.js';
import { checkEventAccess } from '../middleware/auth.middleware.js';
import { uploadPdf } from '../middleware/upload.middleware.js';
import { uploadPublicPdfToCloudinary, isCloudinaryConfigured } from '../utils/cloudinary.util.js';
import { getR2ObjectBuffer, isR2Configured, isR2TemplateRef, uploadBufferToR2 } from '../utils/r2.util.js';
import { resolveLocalUploadPath } from '../utils/local-upload-path.util.js';
import {
  CERTIFICATE_ACCESS_ROLES,
  getCertificateTemplateStoragePrefix,
  isCertificateConfigEnabled,
  normalizeCertificateEnabled,
  normalizeCertificateType,
  validateCertificateTemplateRef
} from '../utils/certificate-admin.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const sendAccessDenied = (res, access) => {
  const status = access.error === 'Event not found' ? 404 : 403;
  return res.status(status).json({ error: access.error || 'Not authorized' });
};

const requireCertificateUploadAccess = async (req, res, next) => {
  try {
    const access = await checkEventAccess(req.user, req.params.id, ['MANAGER', 'SUPER_MANAGER']);

    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    req.eventAccess = access;
    return next();
  } catch (error) {
    console.error('Certificate upload access check error:', error);
    return res.status(500).json({ error: 'Failed to verify certificate upload access' });
  }
};

const requireCertificatePreviewAccess = async (req, res, next) => {
  try {
    const access = await checkEventAccess(req.user, req.params.id, CERTIFICATE_ACCESS_ROLES);

    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    req.eventAccess = access;
    return next();
  } catch (error) {
    console.error('Certificate preview access check error:', error);
    return res.status(500).json({ error: 'Failed to verify certificate preview access' });
  }
};

const cleanupUploadedFile = (file) => {
  if (file?.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
};

// Lazy load certificate service to avoid startup errors if pdf-lib isn't installed
let generateCertificate = null;
let CERTIFICATE_TYPE_LABELS = null;
let sendCertificateEmail = null;
let isEmailDeliveryConfigured = null;

const loadCertificateServices = async () => {
  if (!generateCertificate) {
    try {
      const certService = await import('../services/certificate.service.js');
      generateCertificate = certService.generateCertificate;
      CERTIFICATE_TYPE_LABELS = certService.CERTIFICATE_TYPE_LABELS;
      const emailService = await import('../services/email.service.js');
      sendCertificateEmail = emailService.sendCertificateEmail;
      isEmailDeliveryConfigured = emailService.isEmailDeliveryConfigured;
    } catch (error) {
      console.error('Failed to load certificate services:', error);
      throw new Error('Certificate generation not available. Please ensure pdf-lib is installed.');
    }
  }
};

const safeCertificateFilePart = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'recipient';

async function storeGeneratedCertificatePdf({ buffer, eventId, certificateType, recipientEmail }) {
  const fileName = `${safeCertificateFilePart(certificateType)}-${safeCertificateFilePart(recipientEmail)}-${Date.now()}.pdf`;
  const key = `certificates/generated/${eventId}/${fileName}`;

  if (isR2Configured()) {
    return uploadBufferToR2({
      buffer,
      key,
      contentType: 'application/pdf',
    });
  }

  if (isCloudinaryConfigured()) {
    return uploadPublicPdfToCloudinary(buffer, `certificates/generated/${eventId}`);
  }

  const certificateDir = path.join(__dirname, '../../private/certificates/generated', eventId);
  if (!fs.existsSync(certificateDir)) {
    fs.mkdirSync(certificateDir, { recursive: true });
  }

  const destinationPath = path.join(certificateDir, fileName);
  fs.writeFileSync(destinationPath, buffer);
  return `private://certificates/generated/${eventId}/${fileName}`;
}

const handleCertificateTemplateUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname || '.pdf') || '.pdf';
    const safeExt = ext.toLowerCase() === '.pdf' ? '.pdf' : '.pdf';
    const generatedFileName = `certificate-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    const templateStoragePrefix = getCertificateTemplateStoragePrefix(req.params.id);
    let fileBuffer = req.file.buffer;
    if (!fileBuffer && req.file.path && fs.existsSync(req.file.path)) {
      fileBuffer = fs.readFileSync(req.file.path);
    }

    if (!fileBuffer) {
      return res.status(500).json({ error: 'Uploaded file data is missing' });
    }

    let fileUrl;
    if (isR2Configured()) {
      const key = `${templateStoragePrefix}/${generatedFileName}`;
      fileUrl = await uploadBufferToR2({
        buffer: fileBuffer,
        key,
        contentType: 'application/pdf',
      });
    } else if (isCloudinaryConfigured()) {
      fileUrl = await uploadPublicPdfToCloudinary(fileBuffer, templateStoragePrefix);
    } else {
      const certificateUploadDir = path.join(__dirname, '../../uploads', templateStoragePrefix);
      if (!fs.existsSync(certificateUploadDir)) {
        fs.mkdirSync(certificateUploadDir, { recursive: true });
      }

      const destinationPath = path.join(certificateUploadDir, generatedFileName);
      fs.writeFileSync(destinationPath, fileBuffer);
      fileUrl = `/uploads/${templateStoragePrefix}/${generatedFileName}`;
    }

    cleanupUploadedFile(req.file);

    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  } finally {
    cleanupUploadedFile(req.file);
  }
};

// Legacy unscoped upload route kept only to return a clear authenticated error.
router.post('/upload', (req, res) => {
  res.status(410).json({ error: 'Certificate uploads must target an event. Use /admin/events/:id/certificates/upload.' });
});

// Upload certificate template (PDF) after event access is verified.
router.post('/events/:id/certificates/upload', requireCertificateUploadAccess, uploadPdf.single('file'), handleCertificateTemplateUpload);


// Test/Preview Certificate - generates a sample certificate with dummy data
router.post('/events/:id/certificates/test', requireCertificatePreviewAccess, express.json({ limit: '50mb' }), async (req, res) => {
  try {
    await loadCertificateServices();
  } catch (error) {
    return res.status(500).json({ error: 'Certificate service unavailable: ' + error.message });
  }

  try {
    const { id } = req.params;
    const { templateUrl, mapping, certificateType } = req.body;
    const selectedCertificateType = normalizeCertificateType(certificateType);

    if (!selectedCertificateType) {
      return res.status(400).json({ error: 'Invalid certificate type' });
    }

    // Use provided template/mapping or fetch from event
    let finalTemplateUrl = templateUrl;
    let finalMapping = mapping;

    if (!templateUrl || !mapping) {
      const event = await prisma.event.findUnique({
        where: { id }
      });

      if (!event) return res.status(404).json({ error: 'Event not found' });

      // If a specific certificate type is requested, look in certificateConfigs
      if (selectedCertificateType && event.certificateConfigs) {
        const configs = event.certificateConfigs;
        const config = configs[selectedCertificateType];
        if (config) {
          finalTemplateUrl = finalTemplateUrl || config.templateUrl;
          finalMapping = finalMapping || config.mapping;
        }
      }

      // Fallback to legacy fields
      if (!finalTemplateUrl) {
        finalTemplateUrl = event.certificateTemplateUrl;
      }
      if (!finalMapping) {
        finalMapping = event.certificateMapping;
      }
    }

    if (!finalTemplateUrl) {
      return res.status(400).json({ error: 'No template URL provided. Please upload and save a PDF template first.' });
    }

    finalTemplateUrl = validateCertificateTemplateRef(finalTemplateUrl, {
      allowDataUrl: true,
      eventId: id,
      allowLegacyGlobalTemplateRef: true
    });

    // Generate with sample data
    const typeLabel = CERTIFICATE_TYPE_LABELS[selectedCertificateType] || selectedCertificateType;
    const sampleData = {
      userName: 'John Doe',
      eventName: 'Sample Event Name',
      date: new Date().toDateString(),
      qrCode: 'TEST-QR-12345',
      certificateType: typeLabel,
      rank: selectedCertificateType === 'first_prize' ? '1st Place' :
            selectedCertificateType === 'second_prize' ? '2nd Place' :
            selectedCertificateType === 'third_prize' ? '3rd Place' : ''
    };

    const pdfBytes = await generateCertificate(finalTemplateUrl, finalMapping || [], sampleData);

    // Return as PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="test-certificate.pdf"');
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Test certificate error:', error);
    res.status(500).json({ error: 'Failed to generate test certificate: ' + error.message });
  }
});

// Save certificate config for a specific type
router.put('/events/:id/certificates/config', async (req, res) => {
  try {
    const { id } = req.params;
    const { certificateType, templateUrl, mapping, enabled } = req.body;
    const selectedCertificateType = normalizeCertificateType(certificateType);

    if (!selectedCertificateType) {
      return res.status(400).json({ error: 'Invalid certificate type' });
    }

    const access = await checkEventAccess(req.user, id, ['MANAGER', 'SUPER_MANAGER']);
    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const configs = { ...(event.certificateConfigs || {}) };
    const existingConfig = configs[selectedCertificateType] || {};
    const existingTemplateUrl = selectedCertificateType === 'participation'
      ? existingConfig.templateUrl || event.certificateTemplateUrl
      : existingConfig.templateUrl;
    const nextTemplateUrl = hasOwn(req.body, 'templateUrl')
      ? validateCertificateTemplateRef(templateUrl, {
        eventId: id,
        allowLegacyGlobalTemplateRef: templateUrl === existingTemplateUrl
      })
      : existingConfig.templateUrl;

    configs[selectedCertificateType] = {
      templateUrl: nextTemplateUrl,
      mapping: mapping || existingConfig.mapping || [],
      enabled: normalizeCertificateEnabled(enabled, normalizeCertificateEnabled(existingConfig.enabled, true)),
    };

    // Also set legacy fields if this is the participation certificate
    const updateData = {
      certificateConfigs: configs,
      certificateEnabled: true,
    };

    if (selectedCertificateType === 'participation') {
      updateData.certificateTemplateUrl = configs[selectedCertificateType].templateUrl;
      updateData.certificateMapping = configs[selectedCertificateType].mapping;
    }

    const updated = await prisma.event.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, certificateConfigs: updated.certificateConfigs });
  } catch (error) {
    console.error('Save certificate config error:', error);
    res.status(500).json({ error: 'Failed to save certificate config' });
  }
});

// Get certificate configs for an event
router.get('/events/:id/certificates/config', async (req, res) => {
  try {
    const { id } = req.params;
    const access = await checkEventAccess(req.user, id, CERTIFICATE_ACCESS_ROLES);
    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        certificateEnabled: true,
        certificateTemplateUrl: true,
        certificateMapping: true,
        certificateConfigs: true,
      }
    });

    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Build unified config - merge legacy fields into configs if needed
    const configs = { ...(event.certificateConfigs || {}) };

    // If legacy fields exist but not in configs, add them as participation
    if (event.certificateTemplateUrl && !configs.participation) {
      configs.participation = {
        templateUrl: event.certificateTemplateUrl,
        mapping: event.certificateMapping || [],
        enabled: normalizeCertificateEnabled(event.certificateEnabled, true),
      };
    }

    res.json({
      certificateEnabled: event.certificateEnabled,
      configs,
    });
  } catch (error) {
    console.error('Get certificate config error:', error);
    res.status(500).json({ error: 'Failed to get certificate config' });
  }
});

// Proxy endpoint: serve certificate template PDF (avoids Cloudinary 401 for raw files)
router.get('/events/:id/certificates/template', async (req, res) => {
  try {
    const { id } = req.params;
    const type = normalizeCertificateType(req.query.type || 'participation');

    if (!type) {
      return res.status(400).json({ error: 'Invalid certificate type' });
    }

    const access = await checkEventAccess(req.user, id, CERTIFICATE_ACCESS_ROLES);
    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        certificateTemplateUrl: true,
        certificateConfigs: true,
      }
    });

    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Find the template URL
    const configs = { ...(event.certificateConfigs || {}) };
    let templateUrl = configs[type]?.templateUrl || event.certificateTemplateUrl;

    if (!templateUrl) {
      return res.status(404).json({ error: 'No template configured' });
    }

    templateUrl = validateCertificateTemplateRef(templateUrl, {
      eventId: id,
      allowLegacyGlobalTemplateRef: true
    });

    // Serve from R2 directly
    if (isR2TemplateRef(templateUrl)) {
      try {
        const buffer = await getR2ObjectBuffer(templateUrl, { allowedPrefixes: ['certificates/templates/'] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(buffer);
      } catch (r2Err) {
        console.error('R2 fetch failed for template:', r2Err.message);
        return res.status(500).json({ error: 'Failed to fetch template from storage' });
      }
    }

    // For Cloudinary URLs, serve through the dedicated helper. GET must not migrate or update DB.
    if (templateUrl.startsWith('http')) {
      let buffer = null;
      try {
        const { downloadCloudinaryBuffer } = await import('../utils/cloudinary.util.js');
        buffer = await downloadCloudinaryBuffer(templateUrl);
      } catch (err) {
        console.error('Cloudinary download error:', err.message);
      }

      if (!buffer) {
        return res.status(502).json({ error: 'Failed to fetch template from remote source' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
    }

    // For local files, read from disk
    if (!templateUrl.startsWith('http')) {
      const localPath = resolveLocalUploadPath(templateUrl, { allowedExtensions: ['.pdf'] });

      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ error: 'Template file not found' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(fs.readFileSync(localPath));
    }

    return res.status(400).json({ error: 'Unsupported template URL format' });
  } catch (error) {
    console.error('Template proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Send Certificates to checked-in users (supports typed certificates)
router.post('/events/:id/certificates', async (req, res) => {
  try {
    await loadCertificateServices();
  } catch (error) {
    return res.status(500).json({ error: 'Certificate service unavailable: ' + error.message });
  }

  try {
    const { id } = req.params;
    const { dryRun, certificateType = 'participation', recipientEmails } = req.body;
    const selectedCertificateType = normalizeCertificateType(certificateType);

    if (!selectedCertificateType) {
      return res.status(400).json({ error: 'Invalid certificate type' });
    }

    if (recipientEmails !== undefined && !Array.isArray(recipientEmails)) {
      return res.status(400).json({ error: 'recipientEmails must be an array' });
    }

    const access = await checkEventAccess(req.user, id, CERTIFICATE_ACCESS_ROLES);
    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    const event = await prisma.event.findUnique({
      where: { id }
    });

    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Check if the requested certificate type has a config
    const configs = { ...(event.certificateConfigs || {}) };
    const typeConfig = configs[selectedCertificateType];
    const hasLegacyConfig = selectedCertificateType === 'participation' && event.certificateTemplateUrl;

    if (!typeConfig?.templateUrl && !hasLegacyConfig) {
      return res.status(400).json({ error: `No template configured for certificate type: ${selectedCertificateType}` });
    }

    if (!isCertificateConfigEnabled(typeConfig, event.certificateEnabled)) {
      return res.status(409).json({ error: `Certificate type is disabled: ${selectedCertificateType}` });
    }

    // Resolve the template URL (may need migration from Cloudinary to R2)
    let resolvedTemplateUrl = typeConfig?.templateUrl || event.certificateTemplateUrl;

    // If it's a Cloudinary URL, download via API and migrate to R2
    if (resolvedTemplateUrl && resolvedTemplateUrl.includes('cloudinary.com')) {
      try {
        const { downloadCloudinaryBuffer } = await import('../utils/cloudinary.util.js');
        const templateBuffer = await downloadCloudinaryBuffer(resolvedTemplateUrl);

        if (templateBuffer && isR2Configured()) {
          const key = `${getCertificateTemplateStoragePrefix(id)}/migrated-${selectedCertificateType}-${Date.now()}.pdf`;
          const r2Url = await uploadBufferToR2({ buffer: templateBuffer, key, contentType: 'application/pdf' });
          // Update event config
          if (typeConfig?.templateUrl) {
            configs[selectedCertificateType].templateUrl = r2Url;
            await prisma.event.update({ where: { id }, data: { certificateConfigs: configs } });
          }
          if (event.certificateTemplateUrl === resolvedTemplateUrl) {
            await prisma.event.update({ where: { id }, data: { certificateTemplateUrl: r2Url } });
          }
          resolvedTemplateUrl = r2Url;
        } else if (!templateBuffer) {
          console.error('Cloudinary download returned null; certificate sending may fail');
        }
      } catch (migrateErr) {
        console.error('Template migration failed (will try direct fetch):', migrateErr.message);
      }
    }

    // For prize certificates, use recipientEmails; for participation, use checked-in attendees
    let recipients = [];

    if (recipientEmails && recipientEmails.length > 0) {
      // Sending to specific recipients (prize certificates)
      recipients = recipientEmails
        .map(email => String(email || '').trim().toLowerCase())
        .filter(Boolean)
        .map(email => ({ email, userName: email.split('@')[0] }));

      // Try to resolve names from users table
      for (let i = 0; i < recipients.length; i++) {
        const user = await prisma.user.findUnique({ where: { email: recipients[i].email } });
        if (user) recipients[i].userName = user.name;
      }
    } else {
      // Find checked-in tickets (participation certificates)
      // Check both checkedInAt (new) and scannedAt (legacy) for backward compatibility
      const tickets = await prisma.ticket.findMany({
        where: {
          OR: [
            { checkedInAt: { not: null } },
            { scannedAt: { not: null } }
          ],
          order: {
            registration: {
              eventId: id
            },
            status: 'PAID'
          }
        },
        include: {
          order: {
            include: {
              registration: true
            }
          }
        }
      });

      if (tickets.length === 0) {
        return res.json({ message: 'No checked-in attendees found', count: 0 });
      }

      for (const ticket of tickets) {
        const registration = ticket.order.registration;
        const user = await prisma.user.findUnique({ where: { email: registration.userEmail } });
        const userName = user ? user.name : (registration.formResponse?.name || registration.userEmail.split('@')[0]);
        recipients.push({ email: registration.userEmail, userName, ticketId: ticket.id });
      }
    }

    if (dryRun) {
      return res.json({ message: 'Dry run complete', count: recipients.length });
    }

    let sentCount = 0;
    let generatedCount = 0;
    const errors = [];
    const emailErrors = [];
    const generatedCertificates = [];
    const templateMapping = typeConfig?.mapping || event.certificateMapping || [];
    const typeLabel = CERTIFICATE_TYPE_LABELS[selectedCertificateType] || 'Participation';
    const emailConfigured = isEmailDeliveryConfigured?.() === true;

    for (const recipient of recipients) {
      try {
        const pdfBytes = await generateCertificate(
          resolvedTemplateUrl,
          templateMapping,
          {
            userName: recipient.userName,
            eventName: event.title,
            date: event.startTime.toDateString(),
            qrCode: recipient.ticketId || recipient.email,
            certificateType: typeLabel,
            rank: selectedCertificateType === 'first_prize' ? '1st Place' :
                  selectedCertificateType === 'second_prize' ? '2nd Place' :
                  selectedCertificateType === 'third_prize' ? '3rd Place' : ''
          }
        );
        const pdfBuffer = Buffer.from(pdfBytes);
        const certificateUrl = await storeGeneratedCertificatePdf({
          buffer: pdfBuffer,
          eventId: id,
          certificateType: selectedCertificateType,
          recipientEmail: recipient.email
        });
        generatedCount++;
        generatedCertificates.push({
          email: recipient.email,
          userName: recipient.userName,
          certificateUrl
        });

        if (emailConfigured) {
          try {
            await sendCertificateEmail(
              recipient.email,
              recipient.userName,
              event.title,
              pdfBuffer,
              typeLabel
            );
            sentCount++;
          } catch (emailError) {
            console.error(`Generated ${selectedCertificateType} cert but email failed for ${recipient.email}:`, emailError.message);
            emailErrors.push({ email: recipient.email, error: emailError.message, certificateUrl });
          }
        }
      } catch (err) {
        console.error(`Failed to generate ${selectedCertificateType} cert for ${recipient.email}:`, err.message);
        errors.push({ email: recipient.email, error: err.message });
      }
    }

    const deliveryNote = emailConfigured
      ? `emailed to ${sentCount} recipients`
      : 'email delivery is not configured; generated PDF links are returned';

    res.json({
      message: `${typeLabel} certificates generated for ${generatedCount} recipients; ${deliveryNote}`,
      sent: sentCount,
      generated: generatedCount,
      failed: errors.length,
      emailFailed: emailErrors.length,
      total: recipients.length,
      certificates: generatedCertificates,
      errors: errors.length > 0 ? errors : undefined,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined
    });

  } catch (error) {
    console.error('Certificate generation error:', error);
    res.status(500).json({ error: 'Failed to generate certificates: ' + error.message });
  }
});

export default router;
