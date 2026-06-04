import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CERTIFICATE_ACCESS_ROLES,
  getCertificateTemplateStoragePrefix,
  isCertificateConfigEnabled,
  isCertificateTemplateRefScopedToEvent,
  normalizeCertificateEnabled,
  normalizeCertificateType,
  validateCertificateTemplateRef
} from '../src/utils/certificate-admin.util.js';

test('certificate type normalization accepts only configured certificate types', () => {
  assert.equal(normalizeCertificateType(), 'participation');
  assert.equal(normalizeCertificateType('first_prize'), 'first_prize');
  assert.equal(normalizeCertificateType('unknown'), null);
  assert.deepEqual(CERTIFICATE_ACCESS_ROLES, ['MANAGER', 'SUPER_MANAGER']);
});

test('certificate template refs accept local uploads, R2 templates, and Cloudinary URLs', () => {
  const originalBucket = process.env.R2_BUCKET;
  process.env.R2_BUCKET = 'occasio-test';

  try {
    assert.equal(
      validateCertificateTemplateRef('/uploads/certificates/template.pdf'),
      '/uploads/certificates/template.pdf'
    );

    assert.equal(
      validateCertificateTemplateRef('r2://occasio-test/certificates/templates/template.pdf'),
      'r2://occasio-test/certificates/templates/template.pdf'
    );

    assert.equal(
      validateCertificateTemplateRef('https://res.cloudinary.com/demo/raw/upload/template.pdf'),
      'https://res.cloudinary.com/demo/raw/upload/template.pdf'
    );
  } finally {
    if (originalBucket === undefined) delete process.env.R2_BUCKET;
    else process.env.R2_BUCKET = originalBucket;
  }
});

test('certificate template refs reject unsafe remote and local refs', () => {
  assert.throws(
    () => validateCertificateTemplateRef('https://example.com/template.pdf'),
    /Remote certificate templates/
  );
  assert.throws(
    () => validateCertificateTemplateRef('/uploads/certificates/template.txt'),
    /Certificate template path is invalid/
  );
  assert.throws(
    () => validateCertificateTemplateRef('/uploads/../.env'),
    /Certificate template path is invalid/
  );
});

test('certificate template refs can be scoped to a specific event', () => {
  const originalBucket = process.env.R2_BUCKET;
  process.env.R2_BUCKET = 'occasio-test';
  const eventId = 'event-123';

  try {
    assert.equal(getCertificateTemplateStoragePrefix(eventId), 'certificates/templates/event-123');

    const localRef = '/uploads/certificates/templates/event-123/template.pdf';
    const r2Ref = 'r2://occasio-test/certificates/templates/event-123/template.pdf';
    const cloudinaryRef = 'https://res.cloudinary.com/demo/raw/authenticated/v123/occasio/certificates/templates/event-123/template.pdf';

    assert.equal(validateCertificateTemplateRef(localRef, { eventId }), localRef);
    assert.equal(validateCertificateTemplateRef(r2Ref, { eventId }), r2Ref);
    assert.equal(validateCertificateTemplateRef(cloudinaryRef, { eventId }), cloudinaryRef);
    assert.equal(isCertificateTemplateRefScopedToEvent(localRef, eventId), true);
    assert.equal(isCertificateTemplateRefScopedToEvent(r2Ref, eventId), true);
    assert.equal(isCertificateTemplateRefScopedToEvent(cloudinaryRef, eventId), true);
  } finally {
    if (originalBucket === undefined) delete process.env.R2_BUCKET;
    else process.env.R2_BUCKET = originalBucket;
  }
});

test('certificate template refs reject cross-event templates while allowing exact legacy refs', () => {
  const originalBucket = process.env.R2_BUCKET;
  process.env.R2_BUCKET = 'occasio-test';

  try {
    assert.throws(
      () => validateCertificateTemplateRef('/uploads/certificate-old.pdf', { eventId: 'event-123' }),
      /Certificate template must be uploaded for this event/
    );

    assert.equal(
      validateCertificateTemplateRef('/uploads/certificate-old.pdf', {
        eventId: 'event-123',
        allowLegacyGlobalTemplateRef: true
      }),
      '/uploads/certificate-old.pdf'
    );

    assert.throws(
      () => validateCertificateTemplateRef(
        'r2://occasio-test/certificates/templates/event-999/template.pdf',
        { eventId: 'event-123', allowLegacyGlobalTemplateRef: true }
      ),
      /Certificate template does not belong to this event/
    );
  } finally {
    if (originalBucket === undefined) delete process.env.R2_BUCKET;
    else process.env.R2_BUCKET = originalBucket;
  }
});

test('certificate template data URLs are preview-only', () => {
  const dataUrl = 'data:application/pdf;base64,JVBERi0xLjQ=';
  assert.equal(validateCertificateTemplateRef(dataUrl, { allowDataUrl: true }), dataUrl);
  assert.throws(
    () => validateCertificateTemplateRef(dataUrl),
    /Certificate template must be a PDF/
  );
  assert.throws(
    () => validateCertificateTemplateRef('data:text/plain;base64,SGVsbG8=', { allowDataUrl: true }),
    /Certificate template must be a PDF/
  );
});

test('certificate enabled normalization handles booleans and legacy strings', () => {
  assert.equal(normalizeCertificateEnabled(undefined), true);
  assert.equal(normalizeCertificateEnabled(undefined, false), false);
  assert.equal(normalizeCertificateEnabled(true), true);
  assert.equal(normalizeCertificateEnabled(false), false);
  assert.equal(normalizeCertificateEnabled('true'), true);
  assert.equal(normalizeCertificateEnabled('1'), true);
  assert.equal(normalizeCertificateEnabled('false'), false);
  assert.equal(normalizeCertificateEnabled('0'), false);
  assert.equal(normalizeCertificateEnabled('off'), false);
});

test('certificate send enabled check prefers selected typed config over legacy event flag', () => {
  assert.equal(isCertificateConfigEnabled({ enabled: false }, true), false);
  assert.equal(isCertificateConfigEnabled({ enabled: 'false' }, true), false);
  assert.equal(isCertificateConfigEnabled({ enabled: true }, false), true);
  assert.equal(isCertificateConfigEnabled(undefined, false), false);
  assert.equal(isCertificateConfigEnabled(undefined, 'false'), false);
});
