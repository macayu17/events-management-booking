import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'fs';
import { downloadCloudinaryBuffer } from '../utils/cloudinary.util.js';
import { getR2ObjectBuffer, isR2TemplateRef } from '../utils/r2.util.js';
import { resolveLocalUploadPath } from '../utils/local-upload-path.util.js';

// Certificate types
export const CERTIFICATE_TYPES = {
  PARTICIPATION: 'participation',
  FIRST_PRIZE: 'first_prize',
  SECOND_PRIZE: 'second_prize',
  THIRD_PRIZE: 'third_prize',
};

export const CERTIFICATE_TYPE_LABELS = {
  [CERTIFICATE_TYPES.PARTICIPATION]: 'Participation',
  [CERTIFICATE_TYPES.FIRST_PRIZE]: '1st Prize',
  [CERTIFICATE_TYPES.SECOND_PRIZE]: '2nd Prize',
  [CERTIFICATE_TYPES.THIRD_PRIZE]: '3rd Prize',
};

/**
 * Fetches PDF template bytes from various sources:
 * - base64 data URL
 * - HTTP/HTTPS URL
 * - Local file path (relative to uploads dir)
 */
async function fetchTemplateBytes(templateUrl) {
  if (!templateUrl) {
    throw new Error('No template URL provided');
  }

  // Handle base64 data URL
  if (templateUrl.startsWith('data:')) {
    const base64Data = templateUrl.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  }

  // Handle private R2 object refs (r2://bucket/key)
  if (isR2TemplateRef(templateUrl)) {
    return getR2ObjectBuffer(templateUrl, { allowedPrefixes: ['certificates/templates/'] });
  }

  // Handle HTTP/HTTPS URL. Only server-owned Cloudinary templates are allowed.
  if (templateUrl.startsWith('http://') || templateUrl.startsWith('https://')) {
    if (templateUrl.includes('cloudinary.com')) {
      const buffer = await downloadCloudinaryBuffer(templateUrl);
      if (buffer) return buffer;
      throw new Error('Failed to download template from Cloudinary');
    }

    throw new Error('Remote certificate templates must be uploaded through Occasio storage');
  }

  // Handle local file path (e.g., /uploads/file-xxx.pdf)
  const localPath = resolveLocalUploadPath(templateUrl, { allowedExtensions: ['.pdf'] });

  if (!fs.existsSync(localPath)) {
    throw new Error(`Template file not found at: ${localPath}`);
  }

  return fs.readFileSync(localPath);
}

/**
 * Resolves field value from data based on fieldId
 */
function resolveFieldValue(fieldId, data) {
  switch (fieldId) {
    case 'userName': return data.userName || '';
    case 'eventName': return data.eventName || '';
    case 'date': return data.date || '';
    case 'certificateType': return data.certificateType || '';
    case 'rank': return data.rank || '';
    case 'qrCode': return data.qrCode || '';
    default: return '';
  }
}

export function normalizeCertificateMapping(mapping) {
  if (Array.isArray(mapping) && mapping.length > 0) {
    return mapping;
  }

  return [
    {
      fieldId: 'certificateType',
      x: 0.5,
      y: 0.22,
      fontSize: 18,
      color: '#E23744',
      bold: true,
    },
    {
      fieldId: 'userName',
      x: 0.5,
      y: 0.42,
      fontSize: 34,
      color: '#111827',
      bold: true,
    },
    {
      fieldId: 'eventName',
      x: 0.5,
      y: 0.55,
      fontSize: 18,
      color: '#374151',
      bold: true,
    },
    {
      fieldId: 'date',
      x: 0.5,
      y: 0.66,
      fontSize: 13,
      color: '#6B7280',
      bold: false,
    },
    {
      fieldId: 'qrCode',
      x: 0.5,
      y: 0.82,
      fontSize: 9,
      color: '#6B7280',
      bold: false,
    },
  ];
}

/**
 * Parse hex color to pdf-lib rgb
 */
function parseColor(hexColor) {
  const hex = (hexColor || '#000000').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

const STANDARD_FONT_BY_NAME = {
  Helvetica: StandardFonts.Helvetica,
  'Times-Roman': StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

const STANDARD_BOLD_FONT_BY_NAME = {
  Helvetica: StandardFonts.HelveticaBold,
  'Times-Roman': StandardFonts.TimesRomanBold,
  Courier: StandardFonts.CourierBold,
};

const getFontName = (font = 'Helvetica', bold = false) => {
  const source = bold ? STANDARD_BOLD_FONT_BY_NAME : STANDARD_FONT_BY_NAME;
  return source[font] || source.Helvetica;
};

/**
 * Generates a certificate PDF from a template and field mappings
 * @param {string} templateUrl - URL, data URL, or local path to PDF template
 * @param {Array} mapping - Array of field placement objects
 * @param {Object} data - Data to fill in (userName, eventName, date, certificateType, rank, qrCode)
 * @returns {Uint8Array} generated PDF bytes
 */
export const generateCertificate = async (templateUrl, mapping, data) => {
  try {
    // 1. Fetch the template
    const existingPdfBytes = await fetchTemplateBytes(templateUrl);

    // 2. Load PDF
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const embeddedFonts = new Map();
    const getEmbeddedFont = async (fontName, bold) => {
      const standardFontName = getFontName(fontName, bold);
      if (!embeddedFonts.has(standardFontName)) {
        embeddedFonts.set(standardFontName, await pdfDoc.embedFont(standardFontName));
      }
      return embeddedFonts.get(standardFontName);
    };
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // 3. Draw fields
    for (const field of normalizeCertificateMapping(mapping)) {
      const { fieldId, x, y, fontSize = 12, color = '#000000', bold = false, font: fontName = 'Helvetica' } = field;

      const text = resolveFieldValue(fieldId, data);
      if (!text) continue;

      if (fieldId === 'qrCode') {
        const qrBuffer = await QRCode.toBuffer(text, {
          margin: 0,
          width: 256,
          errorCorrectionLevel: 'M',
        });
        const qrImage = await pdfDoc.embedPng(qrBuffer);
        const size = Math.max(fontSize * 4, 48);

        firstPage.drawImage(qrImage, {
          x: (x * width) - (size / 2),
          y: ((1 - y) * height) - (size / 2),
          width: size,
          height: size,
        });
        continue;
      }

      const selectedFont = await getEmbeddedFont(fontName, bold);
      const textWidth = selectedFont.widthOfTextAtSize(text, fontSize);

      firstPage.drawText(text, {
        x: (x * width) - (textWidth / 2), // Center text on the placement point
        y: (1 - y) * height,
        size: fontSize,
        font: selectedFont,
        color: parseColor(color),
      });
    }

    // 4. Save
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    return pdfBytes;
  } catch (error) {
    console.error('Certificate generation error:', error);
    throw error;
  }
};

/**
 * Generate certificate for a specific type from event config
 * @param {Object} event - Event object with certificateConfigs
 * @param {string} certType - Certificate type (participation, first_prize, etc.)
 * @param {Object} data - Data to fill in
 * @returns {Uint8Array} generated PDF bytes
 */
export const generateTypedCertificate = async (event, certType, data) => {
  const configs = event.certificateConfigs || {};
  const config = configs[certType];

  if (!config || !config.templateUrl) {
    // Fallback to legacy fields for participation certificates
    if (certType === CERTIFICATE_TYPES.PARTICIPATION && event.certificateTemplateUrl) {
      return generateCertificate(
        event.certificateTemplateUrl,
        event.certificateMapping || [],
        { ...data, certificateType: CERTIFICATE_TYPE_LABELS[certType] }
      );
    }
    throw new Error(`No template configured for certificate type: ${certType}`);
  }

  return generateCertificate(
    config.templateUrl,
    config.mapping || [],
    { ...data, certificateType: CERTIFICATE_TYPE_LABELS[certType], rank: getRankLabel(certType) }
  );
};

function getRankLabel(certType) {
  switch (certType) {
    case CERTIFICATE_TYPES.FIRST_PRIZE: return '1st Place';
    case CERTIFICATE_TYPES.SECOND_PRIZE: return '2nd Place';
    case CERTIFICATE_TYPES.THIRD_PRIZE: return '3rd Place';
    default: return '';
  }
}
