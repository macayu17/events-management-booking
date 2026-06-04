import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { resolveLocalUploadPath } from '../src/utils/local-upload-path.util.js';

test('local upload resolver accepts uploads-relative PDF paths', () => {
  const resolved = resolveLocalUploadPath('/uploads/certificates/template.pdf', {
    allowedExtensions: ['.pdf']
  });

  assert.equal(path.basename(resolved), 'template.pdf');
  assert.match(resolved.replace(/\\/g, '/'), /backend\/uploads\/certificates\/template\.pdf$/);
});

test('local upload resolver rejects traversal and non-PDF refs', () => {
  assert.throws(() => resolveLocalUploadPath('/uploads/../.env'), /Invalid upload path/);
  assert.throws(() => resolveLocalUploadPath('/uploads/%2e%2e/.env'), /Invalid upload path/);
  assert.throws(() => resolveLocalUploadPath('https://example.com/template.pdf'), /Invalid upload path/);
  assert.throws(
    () => resolveLocalUploadPath('/uploads/certificates/template.txt', { allowedExtensions: ['.pdf'] }),
    /Unsupported upload file type/
  );
});
