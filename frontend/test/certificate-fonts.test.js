import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve('src/components/CertificateDesigner.jsx'), 'utf8');

test('certificate designer exposes broad built-in and uploaded font controls', () => {
  assert.match(source, /CERTIFICATE_FONT_OPTIONS/);
  assert.match(source, /Helvetica Oblique/);
  assert.match(source, /Helvetica Bold Oblique/);
  assert.match(source, /Times Italic/);
  assert.match(source, /Courier Bold Oblique/);
  assert.match(source, /Zapf Dingbats/);
  assert.match(source, /certificates\/fonts\/upload/);
  assert.match(source, /accept="\.ttf,\.otf,font\/ttf,font\/otf,application\/font-sfnt"/);
  assert.match(source, /fontRef/);
  assert.match(source, /customFonts/);
});
