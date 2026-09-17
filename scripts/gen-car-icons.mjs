// Generates alternative top-down car markers (transparent PNG, zero deps).
// Run: node scripts/gen-car-icons.mjs
// Output: public/car-alt-<name>.png (128x128, faces up/north, drawn upright).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, crc]);
}

const S = 128;
const GLASS = [13, 25, 43, 255];
const SHEEN = [159, 194, 232, 110];
const LIGHT = [216, 236, 255, 255];
const TAIL = [255, 91, 91, 255];
const TYRE = [18, 20, 24, 255];

const shade = (c, d) => [Math.max(0, Math.min(255, c[0] + d)), Math.max(0, Math.min(255, c[1] + d)), Math.max(0, Math.min(255, c[2] + d)), 255];

function car(body, { taxi = false } = {}) {
  const px = Buffer.alloc(S * S * 4); // transparent
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const o = (y * S + x) * 4;
    const a = c[3] / 255, ia = 1 - a;
    px[o] = Math.round(c[0] * a + px[o] * ia);
    px[o + 1] = Math.round(c[1] * a + px[o + 1] * ia);
    px[o + 2] = Math.round(c[2] * a + px[o + 2] * ia);
    px[o + 3] = Math.round(255 * (a + (px[o + 3] / 255) * ia));
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) set(x, y, c);
  };
  const rrect = (x0, y0, x1, y1, r, c) => {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const cx = Math.min(Math.max(x, x0 + r), x1 - r);
        const cy = Math.min(Math.max(y, y0 + r), y1 - r);
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) set(x, y, c);
      }
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(x, y, c);
      }
  };

  ellipse(64, 68, 34, 52, [0, 0, 0, 70]); // soft shadow
  rect(26, 30, 37, 46, TYRE); rect(91, 30, 102, 46, TYRE); // wheels
  rect(26, 82, 37, 98, TYRE); rect(91, 82, 102, 98, TYRE);
  rrect(32, 8, 96, 120, 17, shade(body, -70)); // outline
  rrect(35, 11, 93, 117, 15, body); // body
  rrect(41, 15, 87, 22, 3, shade(body, 45)); // hood highlight
  rrect(42, 28, 86, 50, 6, GLASS); // windshield
  rect(48, 31, 62, 47, SHEEN);
  rrect(44, 56, 84, 80, 4, shade(body, -28)); // roof
  if (taxi) {
    rect(38, 62, 90, 72, [10, 10, 12, 255]); // checker band
    for (let x = 38; x < 90; x += 8) {
      rect(x, 62, x + 3.5, 66.5, [245, 245, 245, 255]);
      rect(x + 4, 67, x + 7.5, 72, [245, 245, 245, 255]);
    }
  }
  rrect(42, 86, 86, 100, 6, GLASS); // rear window
  rrect(38, 12, 51, 19, 3, LIGHT); rrect(77, 12, 90, 19, 3, LIGHT); // headlights
  rrect(38, 107, 51, 113, 3, TAIL); rrect(77, 107, 90, 113, 3, TAIL); // taillights

  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const alts = {
  'car-alt-red': car([214, 38, 61]),
  'car-alt-green': car([18, 161, 80]),
  'car-alt-taxi': car([245, 179, 1], { taxi: true }),
  'car-alt-graphite': car([52, 56, 64]),
};
for (const [name, png] of Object.entries(alts)) {
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log('wrote', `${name}.png`, png.length, 'bytes');
}
