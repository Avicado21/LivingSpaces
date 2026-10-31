/* npm run smoke:bedrock [-- photo.png]
   Live check against Amazon Bedrock with the configured AWS profile: resolves
   credentials, classifies a PNG with Claude Haiku (a generated test image if
   none is given) and streams one sentence from Claude Sonnet as Chad.
   Costs a few cents of Bedrock usage. Exits non-zero on failure. */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { CATEGORY_IDS } from '../shared/categories.js';
import { createBedrockAI, explainError, CHAD_SYSTEM } from '../server/ai.mjs';

/* a 64×64 PNG of a pale "sofa" block on a wood-coloured floor, enough to exercise the call */
function testPng() {
  const w = 64, h = 64, rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) row.push(...(y > 44 ? [168, 120, 80] : y > 22 && x > 8 && x < 56 ? [236, 232, 226] : [240, 228, 216]));
    rows.push(Buffer.from(row));
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const ai = createBedrockAI({ region: process.env.AWS_REGION, profile: process.env.LIVINGSPACES_AWS_PROFILE, haikuModel: process.env.HAIKU_MODEL, sonnetModel: process.env.SONNET_MODEL });
const photo = process.argv[2];
try {
  console.log(`Bedrock ${ai.info.region} · profile ${ai.info.profile}`);
  const c = await ai.checkCredentials();
  console.log(`✓ credentials resolved${c.expiration ? ` (expire ${c.expiration})` : ''}`);

  const png = photo ? readFileSync(photo) : testPng();
  const r = await ai.classify({ pngBase64: png.toString('base64'), categories: CATEGORY_IDS });
  if (!CATEGORY_IDS.includes(r.raw.category)) throw new Error(`Haiku returned an unknown category: ${r.raw.category}`);
  console.log(`✓ ${ai.info.models.classify}: ${r.raw.category} (${r.ms} ms) "${r.raw.reason}" [${photo || 'generated test image'}]`);

  let text = '';
  for await (const ev of ai.chat({ system: `${CHAD_SYSTEM}\n\n<ledger>{"roommates":["Alex","Maya"],"itemsInRoom":[]}</ledger>`, messages: [{ role: 'user', content: 'In one short sentence, who are you?' }] })) if (ev.type === 'text') text += ev.text;
  if (!text.trim()) throw new Error('Sonnet returned no text');
  console.log(`✓ ${ai.info.models.chat}: "${text.trim()}"`);
  console.log('Live Bedrock smoke check passed.');
} catch (err) {
  const e = explainError(err, ai.info.profile);
  console.error(`✗ ${e.code}: ${e.message}${e.detail ? `\n  ${e.detail}` : ''}`);
  process.exit(1);
}
