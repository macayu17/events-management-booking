import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const ensureWithinUploads = (resolvedPath) => {
  const normalizedRoot = `${UPLOADS_ROOT}${path.sep}`;
  if (resolvedPath !== UPLOADS_ROOT && !resolvedPath.startsWith(normalizedRoot)) {
    throw new Error('Invalid upload path');
  }
};

export function resolveLocalUploadPath(uploadRef, { allowedExtensions = [] } = {}) {
  if (typeof uploadRef !== 'string' || uploadRef.trim() === '') {
    throw new Error('Upload path is required');
  }

  const normalizedRef = uploadRef.trim().replace(/\\/g, '/');
  if (normalizedRef.includes('\0') || normalizedRef.startsWith('http') || normalizedRef.startsWith('data:')) {
    throw new Error('Invalid upload path');
  }

  let relativePath;
  if (normalizedRef.startsWith('/uploads/')) {
    relativePath = normalizedRef.slice('/uploads/'.length);
  } else if (normalizedRef.startsWith('uploads/')) {
    relativePath = normalizedRef.slice('uploads/'.length);
  } else if (normalizedRef.startsWith('/')) {
    throw new Error('Invalid upload path');
  } else {
    relativePath = normalizedRef;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch {
    throw new Error('Invalid upload path');
  }
  if (decodedPath.startsWith('../') || decodedPath.includes('/../') || decodedPath === '..') {
    throw new Error('Invalid upload path');
  }

  const resolvedPath = path.resolve(UPLOADS_ROOT, decodedPath);
  ensureWithinUploads(resolvedPath);

  if (allowedExtensions.length > 0) {
    const ext = path.extname(resolvedPath).toLowerCase();
    const allowed = allowedExtensions.map((value) => value.toLowerCase());
    if (!allowed.includes(ext)) {
      throw new Error('Unsupported upload file type');
    }
  }

  return resolvedPath;
}
