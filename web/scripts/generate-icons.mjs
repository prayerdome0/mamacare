/**
 * Generates the PNG app icons from the brand geometry — no image libraries, no
 * network. Re-run with `npm run icons` after changing the brand colours.
 *
 * The vector master is `public/icons/icon.svg`; these PNGs exist because
 * `Notification` icons, `apple-touch-icon` and the manifest need rasters.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BRAND = { r: 4, g: 47, b: 46 }; // brand-950
const ACCENT = { r: 20, g: 184, b: 166 }; // brand-500
const LIGHT = { r: 240, g: 253, b: 250 }; // brand-50

/** Signed-distance style heart in the unit square, y pointing down. */
const HEART_SCALE = 4.1;

function insideHeart(x, y) {
  // Classic algebraic heart, (x² + y² − 1)³ = x²y³, flipped so the apex points
  // down and scaled so the glyph occupies ~62% of the tile.
  const nx = (x - 0.5) * HEART_SCALE;
  const ny = -(y - 0.505) * HEART_SCALE * 0.92;
  const a = nx * nx + ny * ny - 1;
  return a * a * a - nx * nx * ny * ny * ny <= 0;
}

function insideCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function roundedRectAlpha(x, y, size, radius) {
  const r = radius * size;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  const dx = x - cx;
  const dy = y - cy;
  return Math.hypot(dx, dy) <= r ? 1 : 0;
}

function render(size, options = {}) {
  const maskable = options.maskable === true;
  // Maskable icons must survive an arbitrary CSS mask, so the tile is full
  // bleed and the glyph is shrunk into the ~80% safe zone.
  const inset = maskable ? 0.1 : 0;
  const samples = size >= 192 ? 3 : 2;
  const rgba = Buffer.alloc(size * size * 4);
  const radius = 0.22;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          const alpha = maskable ? 1 : roundedRectAlpha(x * size, y * size, size, radius);
          if (alpha === 0) continue;
          const hx = 0.5 + (x - 0.5) * (1 - inset * 2);
          const hy = 0.5 + (y - 0.5) * (1 - inset * 2);
          let colour = BRAND;
          if (insideHeart(hx, hy)) {
            colour = ACCENT;
            if (insideCircle(hx, hy, 0.5, 0.365, 0.062)) colour = LIGHT;
          }
          r += colour.r;
          g += colour.g;
          b += colour.b;
          a += 255;
        }
      }
      const divisor = samples * samples;
      const offset = (py * size + px) * 4;
      const coverage = a / divisor / 255;
      if (coverage === 0) continue;
      rgba[offset] = Math.round(r / divisor);
      rgba[offset + 1] = Math.round(g / divisor);
      rgba[offset + 2] = Math.round(b / divisor);
      rgba[offset + 3] = Math.round(coverage * 255);
    }
  }
  return rgba;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-16.png', 16],
  ['icon-32.png', 32],
  ['icon-48.png', 48],
  ['icon-96.png', 96],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon.png', 48],
  ['icon-maskable.png', 512],
];

for (const [name, size] of targets) {
  const png = encodePng(size, render(size, { maskable: name.includes('maskable') }));
  writeFileSync(join(outDir, name), png);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
