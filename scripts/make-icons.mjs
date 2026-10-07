// Generates web/icons/*.png: an abstract single wave on --c-bg, no text (§13.5). Pure Node (zlib), no deps.
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'icons');
const BG = [0x12, 0x14, 0x18];
const LINE = [0x8c, 0xc3, 0xcc];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draw the icon. `inset` is the fraction of the canvas the wave spans (maskable needs the 80% safe zone).
 * Anti-aliased by exact distance to a densely sampled polyline of the curve.
 */
function draw(size, inset) {
  const rgb = Buffer.alloc(size * size * 3);
  const x0 = size * (0.5 - inset / 2), x1 = size * (0.5 + inset / 2);
  const cy = size * 0.5;
  const A = size * inset * 0.17;
  const L = (x1 - x0) / 1.25; // 1.25 periods
  const half = size * inset * 0.04; // half stroke width
  const f = (x) => cy - A * Math.sin(((x - x0) / L) * 2 * Math.PI + Math.PI * 0.15);
  const pts = [];
  for (let x = x0; x <= x1; x += 0.25) pts.push([x, f(x)]);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = px + 0.5, y = py + 0.5;
      let d = Infinity;
      if (x > x0 - half - 2 && x < x1 + half + 2) {
        const lo = Math.max(0, Math.floor((x - half - 2 - x0) / 0.25));
        const hi = Math.min(pts.length - 1, Math.ceil((x + half + 2 - x0) / 0.25));
        for (let k = lo; k <= hi; k++) {
          const dd = Math.hypot(x - pts[k][0], y - pts[k][1]);
          if (dd < d) d = dd;
        }
      }
      const a = Math.min(1, Math.max(0, half + 0.5 - d));
      const i = (py * size + px) * 3;
      for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(BG[c] * (1 - a) + LINE[c] * a);
    }
  }
  return png(size, rgb);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon-180.png'), draw(180, 0.72));
writeFileSync(join(OUT, 'icon-192.png'), draw(192, 0.72));
writeFileSync(join(OUT, 'icon-512.png'), draw(512, 0.72));
writeFileSync(join(OUT, 'icon-512-maskable.png'), draw(512, 0.56));
console.log('icons written to', OUT);
