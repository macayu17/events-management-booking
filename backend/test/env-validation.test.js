import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRuntimeEnv } from '../src/config/env.js';

const ENV_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
  'QR_SECRET_KEY',
  'TICKET_DOWNLOAD_SECRET',
  'TEAM_INVITE_SECRET',
  'CHECKOUT_ACCESS_SECRET',
  'PHONEPE_ENV',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
];

const snapshotEnv = () => Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const restoreEnv = (snapshot) => {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
};

const setProductionEnv = (overrides = {}) => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/occasio';
  process.env.JWT_SECRET = 'jwt-secret';
  process.env.FRONTEND_URL = 'https://example.com';
  process.env.QR_SECRET_KEY = 'qr-secret';
  process.env.TICKET_DOWNLOAD_SECRET = 'ticket-download-secret';
  process.env.TEAM_INVITE_SECRET = 'team-invite-secret';
  process.env.CHECKOUT_ACCESS_SECRET = 'checkout-access-secret';
  process.env.CLOUDINARY_CLOUD_NAME = 'occasio';
  process.env.CLOUDINARY_API_KEY = 'cloudinary-key';
  process.env.CLOUDINARY_API_SECRET = 'cloudinary-secret';

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
};

test('production env validation requires dedicated public signing secrets', () => {
  const snapshot = snapshotEnv();

  try {
    setProductionEnv({
      TICKET_DOWNLOAD_SECRET: undefined,
      TEAM_INVITE_SECRET: undefined,
      CHECKOUT_ACCESS_SECRET: undefined,
    });

    assert.throws(
      () => validateRuntimeEnv(),
      /TICKET_DOWNLOAD_SECRET.*TEAM_INVITE_SECRET.*CHECKOUT_ACCESS_SECRET/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test('production env validation rejects token secrets reused from JWT_SECRET', () => {
  const snapshot = snapshotEnv();

  try {
    setProductionEnv({
      TICKET_DOWNLOAD_SECRET: 'jwt-secret',
      TEAM_INVITE_SECRET: 'jwt-secret',
      CHECKOUT_ACCESS_SECRET: 'jwt-secret',
    });

    assert.throws(
      () => validateRuntimeEnv(),
      /TICKET_DOWNLOAD_SECRET must be different.*TEAM_INVITE_SECRET must be different.*CHECKOUT_ACCESS_SECRET must be different/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test('production env validation rejects local-only upload storage', () => {
  const snapshot = snapshotEnv();

  try {
    setProductionEnv({
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
      R2_ACCOUNT_ID: undefined,
      R2_ACCESS_KEY_ID: undefined,
      R2_SECRET_ACCESS_KEY: undefined,
      R2_BUCKET: undefined,
      R2_ENDPOINT: undefined,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      S3_BUCKET_NAME: undefined,
    });

    assert.throws(
      () => validateRuntimeEnv(),
      /production poster uploads.*production PDF uploads/
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test('production env validation accepts distinct required secrets', () => {
  const snapshot = snapshotEnv();

  try {
    setProductionEnv();

    assert.doesNotThrow(() => validateRuntimeEnv());
  } finally {
    restoreEnv(snapshot);
  }
});
