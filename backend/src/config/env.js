const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
  'QR_SECRET_KEY',
  'TICKET_DOWNLOAD_SECRET',
  'TEAM_INVITE_SECRET',
  'CHECKOUT_ACCESS_SECRET',
];

const VALID_PHONEPE_ENVS = new Set(['sandbox', 'production']);
const hasAllEnv = (keys) => keys.every((key) => String(process.env[key] || '').trim().length > 0);
const hasCloudinaryStorage = () => hasAllEnv(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']);
const hasR2Storage = () => hasAllEnv(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT']);
const hasS3Storage = () => hasAllEnv(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME']);

export const validateRuntimeEnv = () => {
  const missing = REQUIRED_PRODUCTION_ENV.filter((key) => !process.env[key]);
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_SECRET);
  const phonePeEnv = process.env.PHONEPE_ENV;
  const productionStorageConfigured = hasCloudinaryStorage() || hasR2Storage() || hasS3Storage();
  const productionPosterStorageConfigured = hasCloudinaryStorage() || hasS3Storage();

  if (process.env.NODE_ENV === 'production' && razorpayConfigured && !process.env.RAZORPAY_WEBHOOK_SECRET) {
    missing.push('RAZORPAY_WEBHOOK_SECRET');
  }

  if (process.env.NODE_ENV === 'production' && !productionPosterStorageConfigured) {
    missing.push('Cloudinary or S3 storage is required for production poster uploads');
  }

  if (process.env.NODE_ENV === 'production' && !productionStorageConfigured) {
    missing.push('R2, Cloudinary, or S3 storage is required for production PDF uploads');
  }

  if (phonePeEnv && !VALID_PHONEPE_ENVS.has(phonePeEnv)) {
    missing.push('PHONEPE_ENV must be one of: sandbox, production');
  }

  if (
    process.env.NODE_ENV === 'production'
    && process.env.TICKET_DOWNLOAD_SECRET
    && process.env.TICKET_DOWNLOAD_SECRET === process.env.JWT_SECRET
  ) {
    missing.push('TICKET_DOWNLOAD_SECRET must be different from JWT_SECRET');
  }

  if (
    process.env.NODE_ENV === 'production'
    && process.env.TEAM_INVITE_SECRET
    && process.env.TEAM_INVITE_SECRET === process.env.JWT_SECRET
  ) {
    missing.push('TEAM_INVITE_SECRET must be different from JWT_SECRET');
  }

  if (
    process.env.NODE_ENV === 'production'
    && process.env.CHECKOUT_ACCESS_SECRET
    && process.env.CHECKOUT_ACCESS_SECRET === process.env.JWT_SECRET
  ) {
    missing.push('CHECKOUT_ACCESS_SECRET must be different from JWT_SECRET');
  }

  if (missing.length === 0) return;

  const message = `Missing required production environment variables: ${missing.join(', ')}`;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }

  console.warn(`⚠️ ${message}`);
};
