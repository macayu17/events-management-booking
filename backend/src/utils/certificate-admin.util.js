import { isR2TemplateRef, parseR2Ref } from './r2.util.js';
import { resolveLocalUploadPath } from './local-upload-path.util.js';

export const CERTIFICATE_TYPE_VALUES = new Set(['participation', 'first_prize', 'second_prize', 'third_prize']);
export const CERTIFICATE_ACCESS_ROLES = ['MANAGER', 'SUPER_MANAGER'];
export const CERTIFICATE_TEMPLATE_STORAGE_PREFIX = 'certificates/templates';

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const parseRequiredString = (value, fieldName) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw badRequest(`${fieldName} is required`);
  return normalized;
};

const safeStoragePathPart = (value, fieldName = 'value') => {
  const normalized = parseRequiredString(value, fieldName)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  if (!normalized) throw badRequest(`${fieldName} is invalid`);
  return normalized;
};

export const getCertificateTemplateStoragePrefix = (eventId) => (
  `${CERTIFICATE_TEMPLATE_STORAGE_PREFIX}/${safeStoragePathPart(eventId, 'eventId')}`
);

export const normalizeCertificateType = (certificateType = 'participation') => {
  const normalized = String(certificateType || 'participation').trim();
  return CERTIFICATE_TYPE_VALUES.has(normalized) ? normalized : null;
};

export const normalizeCertificateEnabled = (value, fallback = true) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
};

export const isCertificateConfigEnabled = (typeConfig, legacyEnabled = true) => (
  typeConfig
    ? normalizeCertificateEnabled(typeConfig.enabled, true)
    : normalizeCertificateEnabled(legacyEnabled, true)
);

const decodePathParts = (pathname) => pathname
  .split('/')
  .filter(Boolean)
  .map((part) => decodeURIComponent(part));

const getLocalUploadRelativePath = (templateRef) => {
  const normalizedRef = String(templateRef || '').trim().replace(/\\/g, '/');
  if (normalizedRef.startsWith('/uploads/')) return normalizedRef.slice('/uploads/'.length);
  if (normalizedRef.startsWith('uploads/')) return normalizedRef.slice('uploads/'.length);
  return normalizedRef.startsWith('/') ? null : normalizedRef;
};

const getCloudinaryPublicId = (templateRef) => {
  try {
    const parsed = new URL(templateRef);
    if (parsed.hostname !== 'res.cloudinary.com' && !parsed.hostname.endsWith('.cloudinary.com')) return null;

    const pathParts = decodePathParts(parsed.pathname);
    const rawIndex = pathParts.indexOf('raw');
    if (rawIndex === -1) return null;

    let startIndex = rawIndex + 2;
    if (pathParts[startIndex]?.startsWith('s--')) startIndex += 1;
    if (/^v\d+/.test(pathParts[startIndex] || '')) startIndex += 1;

    const publicId = pathParts.slice(startIndex).join('/');
    return publicId || null;
  } catch {
    return null;
  }
};

const getCertificateTemplatePath = (templateRef) => {
  const r2Ref = parseR2Ref(templateRef);
  if (r2Ref?.key?.startsWith(`${CERTIFICATE_TEMPLATE_STORAGE_PREFIX}/`)) return r2Ref.key;

  const cloudinaryPublicId = getCloudinaryPublicId(templateRef);
  const cloudinaryPrefix = `occasio/${CERTIFICATE_TEMPLATE_STORAGE_PREFIX}/`;
  if (cloudinaryPublicId?.startsWith(cloudinaryPrefix)) {
    return cloudinaryPublicId.slice('occasio/'.length);
  }

  const localPath = getLocalUploadRelativePath(templateRef);
  if (localPath?.startsWith(`${CERTIFICATE_TEMPLATE_STORAGE_PREFIX}/`)) return localPath;

  return null;
};

const getTemplateEventPathPart = (templatePath) => {
  if (!templatePath?.startsWith(`${CERTIFICATE_TEMPLATE_STORAGE_PREFIX}/`)) return null;
  const remainder = templatePath.slice(`${CERTIFICATE_TEMPLATE_STORAGE_PREFIX}/`.length);
  const parts = remainder.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[0] : null;
};

export const isCertificateTemplateRefScopedToEvent = (templateRef, eventId) => {
  const templatePath = getCertificateTemplatePath(templateRef);
  return getTemplateEventPathPart(templatePath) === safeStoragePathPart(eventId, 'eventId');
};

const assertTemplateRefBelongsToEvent = (templateRef, eventId, { allowLegacyGlobalTemplateRef = false } = {}) => {
  if (!eventId) return;

  const templatePath = getCertificateTemplatePath(templateRef);
  const scopedEventId = getTemplateEventPathPart(templatePath);
  const expectedEventId = safeStoragePathPart(eventId, 'eventId');

  if (scopedEventId === expectedEventId) return;
  if (scopedEventId && scopedEventId !== expectedEventId) {
    throw badRequest('Certificate template does not belong to this event');
  }
  if (allowLegacyGlobalTemplateRef) return;

  throw badRequest('Certificate template must be uploaded for this event');
};

export const validateCertificateTemplateRef = (templateUrl, {
  allowDataUrl = false,
  eventId,
  allowLegacyGlobalTemplateRef = false
} = {}) => {
  if (!templateUrl) return null;
  const value = parseRequiredString(templateUrl, 'templateUrl');

  if (value.startsWith('data:')) {
    if (allowDataUrl && value.startsWith('data:application/pdf;base64,')) return value;
    throw badRequest('Certificate template must be a PDF uploaded through Occasio storage');
  }

  if (isR2TemplateRef(value)) {
    assertTemplateRefBelongsToEvent(value, eventId, { allowLegacyGlobalTemplateRef });
    return value;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw badRequest('Certificate template URL is invalid');
    }

    if (parsed.hostname === 'res.cloudinary.com' || parsed.hostname.endsWith('.cloudinary.com')) {
      assertTemplateRefBelongsToEvent(value, eventId, { allowLegacyGlobalTemplateRef });
      return value;
    }

    throw badRequest('Remote certificate templates must be uploaded through Occasio storage');
  }

  try {
    resolveLocalUploadPath(value, { allowedExtensions: ['.pdf'] });
  } catch {
    throw badRequest('Certificate template path is invalid');
  }

  assertTemplateRefBelongsToEvent(value, eventId, { allowLegacyGlobalTemplateRef });
  return value;
};
