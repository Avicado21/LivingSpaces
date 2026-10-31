import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffBytes } from '../web/src/lib/image.js';

const bytes = (...parts) => {
  const out = [];
  for (const p of parts) typeof p === 'string' ? out.push(...[...p].map(c => c.charCodeAt(0))) : out.push(...p);
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};
const ftyp = (brand, compat = 'mif1') => bytes([0, 0, 0, 0x24], 'ftyp', brand, [0, 0, 0, 0], compat);

test('sniffBytes reads the real format from magic bytes', () => {
  assert.equal(sniffBytes(bytes([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(sniffBytes(bytes([0x89], 'PNG')), 'png');
  assert.equal(sniffBytes(bytes('GIF89a')), 'gif');
  assert.equal(sniffBytes(bytes('RIFF', [0, 0, 0, 0], 'WEBP')), 'webp');
  assert.equal(sniffBytes(bytes('BM')), 'bmp');
  assert.equal(sniffBytes(bytes('II*\0')), 'tiff');
  assert.equal(sniffBytes(bytes('II*\0'), 'IMG_0001.DNG'), 'dng');
});

test('sniffBytes tells iPhone HEIC, HEIF and AVIF apart from the ftyp box', () => {
  assert.equal(sniffBytes(ftyp('heic')), 'heic');
  assert.equal(sniffBytes(ftyp('mif1', 'heic')), 'heif');
  assert.equal(sniffBytes(ftyp('avif')), 'avif');
  assert.equal(sniffBytes(ftyp('mif1', 'avif')), 'avif');
});

test('a HEIC with an empty MIME type and an unknown header falls back to the extension', () => {
  assert.equal(sniffBytes(bytes('????'), 'IMG_4021.HEIC'), 'heic');
  assert.equal(sniffBytes(bytes('????'), 'notes.txt'), 'unknown');
});
