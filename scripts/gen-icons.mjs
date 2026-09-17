// Generates PWA PNG icons from the Torqv "trail car" logo (zero deps).
// Run: npm run gen:icons
// Shapes are drawn 2x supersampled, then downsampled for smooth edges.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(root, { recursive: true });

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

const BG = [11, 14, 19, 255];
const GREEN = [0, 204, 102, 255];
const BLUE = [30, 95, 208, 255];
const NAVY = [13, 47, 107, 255];
const GLASS = [11, 21, 38, 255];
const SHEEN = [159, 194, 232, 140];
const ROOF = [47, 120, 239, 255];
const LIGHT = [216, 236, 255, 255];
const TAIL = [255, 91, 91, 255];
const TYRE = [20, 22, 28, 255];

/**
 * @param size output px
 * @param bg 'round' (transparent corners) | 'square' (full-bleed)
 * @param art 1 = artwork fills the canvas, 0.8 = centered with padding (maskable safe zone)
 */
function render(size, bg, art) {
  const SS = 2;
  const W = size * SS;
  const px = Buffer.alloc(W * W * 4);
  const k = (SS * size * art) / 512;
  const ox = (SS * size * (1 - art)) / 2;
  const X = (x) => ox + x * k;

  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const o = (y * W + x) * 4;
    const a = c[3] / 255, ia = 1 - a;
    px[o] = Math.round(c[0] * a + px[o] * ia);
    px[o + 1] = Math.round(c[1] * a + px[o + 1] * ia);
    px[o + 2] = Math.round(c[2] * a + px[o + 2] * ia);
    px[o + 3] = Math.round(255 * (a + (px[o + 3] / 255) * ia));
  };
  const dot = (cx, cy, r, c) => {
    const R = r * k;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= R * R) set(x, y, c);
      }
  };
  const line = (pts, w, c) => {
    const path = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * k));
      for (let s = 0; s <= steps; s++) path.push([X(x0 + ((x1 - x0) * s) / steps), X(y0 + ((y1 - y0) * s) / steps)]);
    }
    for (const [x, y] of path) dot(x, y, (w * k) / 2 / k, c);
  };
  const bezier = (p0, p1, p2, p3, w, c) => {
    const pts = [];
    for (let s = 0; s <= 64; s++) {
      const t = s / 64, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    line(pts, w, c);
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.floor(X(y0)); y <= Math.ceil(X(y1)); y++)
      for (let x = Math.floor(X(x0)); x <= Math.ceil(X(x1)); x++) set(x, y, c);
  };
  const rrect = (x0, y0, x1, y1, r, c) => {
    const rx = r * k;
    for (let y = Math.floor(X(y0)); y <= Math.ceil(X(y1)); y++)
      for (let x = Math.floor(X(x0)); x <= Math.ceil(X(x1)); x++) {
        const cx = Math.min(Math.max(x, X(x0) + rx), X(x1) - rx);
        const cy = Math.min(Math.max(y, X(y0) + rx), X(y1) - rx);
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rx * rx) set(x, y, c);
      }
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    const RX = rx * k, RY = ry * k, CX = X(cx), CY = X(cy);
    for (let y = Math.floor(CY - RY); y <= Math.ceil(CY + RY); y++)
      for (let x = Math.floor(CX - RX); x <= Math.ceil(CX + RX); x++) {
        const dx = (x - CX) / RX, dy = (y - CY) / RY;
        if (dx * dx + dy * dy <= 1) set(x, y, c);
      }
  };

  // Background.
  if (bg === 'round') {
    rrect(0, 0, 512, 512, 116, BG);
  } else {
    rect(0, 0, 512, 512, BG);
  }

  // Motion trails.
  bezier([64, 428], [150, 400], [150, 320], [232, 296], 38, GREEN);
  bezier([64, 372], [120, 356], [130, 320], [180, 306], 20, [0, 204, 102, 140]);
  // Wheels.
  rrect(184, 180, 202, 222, 6, TYRE);
  rrect(310, 180, 328, 222, 6, TYRE);
  rrect(184, 300, 202, 342, 6, TYRE);
  rrect(310, 300, 328, 342, 6, TYRE);
  // Body.
  rrect(196, 120, 316, 392, 52, NAVY);
  rrect(204, 128, 308, 384, 46, BLUE);
  rrect(208, 138, 238, 154, 6, LIGHT);
  rrect(274, 138, 304, 154, 6, LIGHT);
  rrect(220, 170, 292, 214, 12, GLASS);
  rect(232, 174, 258, 210, SHEEN);
  rrect(222, 224, 290, 280, 8, ROOF);
  rrect(220, 290, 292, 324, 12, GLASS);
  rrect(208, 358, 238, 372, 6, TAIL);
  rrect(274, 358, 304, 372, 6, TAIL);
  void ellipse;

  // Downsample SSxSS -> size.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * W + (x * SS + dx)) * 4;
          r += px[o]; g += px[o + 1]; b += px[o + 2]; a += px[o + 3];
        }
      }
      const o = (y * size + x) * 4, n = SS * SS;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    out.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(root, 'icon-192.png'), render(192, 'round', 1));
writeFileSync(join(root, 'icon-512.png'), render(512, 'round', 1));
writeFileSync(join(root, 'maskable-512.png'), render(512, 'square', 0.8));
writeFileSync(join(root, 'apple-touch-icon-180.png'), render(180, 'square', 1));
console.log('icons written to', root);
