/* Any phone photo -> PNG, in the browser. The real format is read from the
   file's first bytes (phones often send HEIC with an empty MIME type); HEIC/HEIF
   falls back to libheif (heic2any, loaded on demand) where the browser can't
   decode it. The result is a PNG with its long edge <= 1568 px, under 3.75 MB. */
export const FORMATS = {
  heic: { label: 'HEIC', from: 'iPhone camera default' },
  heif: { label: 'HEIF', from: 'iPhone / Samsung "high efficiency"' },
  jpeg: { label: 'JPEG', from: 'Android and most cameras' },
  png: { label: 'PNG', from: 'screenshots' },
  webp: { label: 'WebP', from: 'Android and web downloads' },
  avif: { label: 'AVIF', from: 'newer Android and web' },
  gif: { label: 'GIF', from: 'web' },
  bmp: { label: 'BMP', from: 'Windows' },
  tiff: { label: 'TIFF', from: 'scanners (Safari only)' },
  dng: { label: 'DNG (RAW)', from: 'pro camera modes' },
  unknown: { label: 'unknown', from: 'unrecognised file' },
};
export const ACCEPT = 'image/*,.heic,.heif,.avif,.webp,.tif,.tiff,.dng';
export const MAX_EDGE = 1568;
export const MAX_BYTES = 3.75e6;
export const mb = n => (n / 1e6).toFixed(n < 1e6 ? 2 : 1) + ' MB';

const EXT = { jpg: 'jpeg', jpeg: 'jpeg', heic: 'heic', heif: 'heif', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif', bmp: 'bmp', tif: 'tiff', tiff: 'tiff', dng: 'dng' };

/* bytes: Uint8Array of at least the first 32 bytes; name: file name for the extension fallback */
export function sniffBytes(b, name = '') {
  const str = (s, e) => String.fromCharCode(...b.slice(s, e));
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && str(1, 4) === 'PNG') return 'png';
  if (str(0, 3) === 'GIF') return 'gif';
  if (str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') return 'webp';
  if (str(0, 2) === 'BM') return 'bmp';
  if (str(0, 4) === 'II*\0' || str(0, 4) === 'MM\0*') return /\.dng$/i.test(name) ? 'dng' : 'tiff';
  if (str(4, 8) === 'ftyp') {
    const brand = str(8, 12), compat = str(16, 32);
    if (/^avi[fs]$/.test(brand) || /avif/.test(compat)) return 'avif';
    if (/^(heic|heix|hevc|hevx|heim|heis)$/.test(brand)) return 'heic';
    if (/^(mif1|msf1)$/.test(brand)) return 'heif';
  }
  return EXT[(name.split('.').pop() || '').toLowerCase()] || 'unknown';
}
export async function sniffFormat(file) {
  return sniffBytes(new Uint8Array(await file.slice(0, 32).arrayBuffer()), file.name || '');
}

export async function decode(blob, fmt, onStep = () => {}) {
  if (fmt === 'dng') throw new Error("RAW (DNG) photos can't be read in a browser. Export it as JPEG or HEIC and try again.");
  try { return { bitmap: await createImageBitmap(blob), via: 'browser decoder' }; }
  catch { if (fmt !== 'heic' && fmt !== 'heif') throw new Error(`This browser can't read ${FORMATS[fmt]?.label || 'this'} images. Try JPEG, PNG or HEIC.`); }
  onStep('Decoding HEIC with libheif (heic2any)…');
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob, toType: 'image/png' });
  return { bitmap: await createImageBitmap(Array.isArray(out) ? out[0] : out), via: 'libheif (heic2any)' };
}

export async function toPNG(bitmap) {
  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height)), blob, w, h;
  for (let i = 0; i < 6; i++) {
    w = Math.max(1, Math.round(bitmap.width * scale)); h = Math.max(1, Math.round(bitmap.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (blob.size <= MAX_BYTES) break;
    scale *= 0.8;
  }
  return { blob, w, h, url: URL.createObjectURL(blob) };
}

export const blobToBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});
