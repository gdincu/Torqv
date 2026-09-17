// Generates PWA PNG icons with zero dependencies (minimal PNG encoder).
// Run: npm run gen:icons
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

/** Dark rounded-square bg, green track polyline, red car dot. */
function render(size, pad = 0) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [11, 14, 19, 255];
  const r = Math.floor(size * 0.22);
  const set = (x, y, col) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 4;
    px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x, r), size - 1 - r);
      const cy = Math.min(Math.max(y, r), size - 1 - r);
      const dx = x - cx, dy = y - cy;
      set(x, y, dx * dx + dy * dy <= r * r ? bg : [0, 0, 0, 0]);
    }
  }
  const line = (x0, y0, x1, y1, w, col) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) {
        if (a * a + b * b <= w * w) set(Math.round(cx + a), Math.round(cy + b), col);
      }
    }
  };
  const m = pad + size * 0.16;
  const pts = [
    [m, size - m], [size * 0.38, size * 0.62], [size * 0.5, size * 0.47],
    [size * 0.69, size * 0.41], [size - m, m],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], Math.max(2, size * 0.022), [0, 204, 102, 255]);
  }
  const [ex, ey] = pts[pts.length - 1];
  for (let a = -size * 0.05; a <= size * 0.05; a++) for (let b = -size * 0.05; b <= size * 0.05; b++) {
    if (a * a + b * b <= (size * 0.05) ** 2) set(Math.round(ex + a), Math.round(ey + b), [229, 72, 77, 255]);
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

writeFileSync(join(root, 'icon-192.png'), render(192));
writeFileSync(join(root, 'icon-512.png'), render(512));
writeFileSync(join(root, 'maskable-512.png'), render(512, 512 * 0.1));
writeFileSync(join(root, 'apple-touch-icon-180.png'), render(180));
console.log('icons written to', root);
