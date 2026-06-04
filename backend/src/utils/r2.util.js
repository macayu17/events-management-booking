import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const isTruthy = (value) => String(value || '').trim().length > 0;

export const isR2Configured = () => {
  return (
    isTruthy(process.env.R2_ACCOUNT_ID) &&
    isTruthy(process.env.R2_ACCESS_KEY_ID) &&
    isTruthy(process.env.R2_SECRET_ACCESS_KEY) &&
    isTruthy(process.env.R2_BUCKET) &&
    isTruthy(process.env.R2_ENDPOINT)
  );
};

const getR2Client = () => {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured');
  }

  return new S3Client({
    endpoint: process.env.R2_ENDPOINT,
    region: process.env.R2_REGION || 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
};

const streamToBuffer = async (body) => {
  if (!body) return null;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const parseR2Ref = (templateRef) => {
  if (!templateRef) return null;

  if (templateRef.startsWith('r2://')) {
    const withoutProtocol = templateRef.slice('r2://'.length);
    const firstSlashIndex = withoutProtocol.indexOf('/');
    if (firstSlashIndex === -1) return null;
    const bucket = withoutProtocol.slice(0, firstSlashIndex);
    const key = withoutProtocol.slice(firstSlashIndex + 1);
    return bucket && key ? { bucket, key } : null;
  }

  try {
    const parsed = new URL(templateRef);
    if (!parsed.hostname.includes('r2.cloudflarestorage.com')) return null;
    const pathParts = parsed.pathname.replace(/^\//, '').split('/');
    if (pathParts.length < 2) return null;
    const bucket = pathParts[0];
    const key = pathParts.slice(1).join('/');
    return bucket && key ? { bucket, key } : null;
  } catch {
    return null;
  }
};

const getAllowedR2Ref = (templateRef, { allowedPrefixes = [] } = {}) => {
  const parsed = parseR2Ref(templateRef);
  if (!parsed) return null;

  if (process.env.R2_BUCKET && parsed.bucket !== process.env.R2_BUCKET) {
    return null;
  }

  if (allowedPrefixes.length > 0 && !allowedPrefixes.some((prefix) => parsed.key.startsWith(prefix))) {
    return null;
  }

  return parsed;
};

export const isR2ObjectRef = (templateRef, options = {}) => Boolean(getAllowedR2Ref(templateRef, options));

export const isR2TemplateRef = (templateRef) => isR2ObjectRef(templateRef, {
  allowedPrefixes: ['certificates/templates/'],
});

export const isR2TicketPdfRef = (templateRef) => isR2ObjectRef(templateRef, {
  allowedPrefixes: ['tickets/'],
});

export const uploadBufferToR2 = async ({ buffer, key, contentType = 'application/octet-stream' }) => {
  const s3 = getR2Client();
  const bucket = process.env.R2_BUCKET;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `r2://${bucket}/${key}`;
};

export const getR2ObjectBuffer = async (templateRef, options = {}) => {
  const parsed = getAllowedR2Ref(templateRef, options);
  if (!parsed) {
    throw new Error('Invalid R2 template reference');
  }

  const s3 = getR2Client();
  const object = await s3.send(new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
  }));

  const buffer = await streamToBuffer(object?.Body);
  if (!buffer) {
    throw new Error('R2 object has no body');
  }

  return buffer;
};
