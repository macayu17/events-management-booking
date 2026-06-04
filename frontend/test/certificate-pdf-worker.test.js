import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('certificate preview uses the same pdfjs worker version as react-pdf', () => {
  const lockfile = JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'));
  const packages = lockfile.packages || {};
  const rootPdfjsVersion = packages['node_modules/pdfjs-dist']?.version;
  const reactPdfPdfjsVersion = packages['node_modules/react-pdf']?.dependencies?.['pdfjs-dist'];

  assert.equal(rootPdfjsVersion, reactPdfPdfjsVersion);
  assert.equal(packages['node_modules/react-pdf/node_modules/pdfjs-dist'], undefined);
});
