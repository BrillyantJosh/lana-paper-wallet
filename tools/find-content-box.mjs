/**
 * Finds the largest all-white axis-aligned rectangle in an ornament template —
 * the area where PDF text and QR codes can safely be placed.
 *
 * Usage:  node tools/find-content-box.mjs <ornament.png> [threshold=248] [inset=0.012]
 *                                          [x0 y0 x1 y1]
 *
 * The four optional bounds (fractions of the image) restrict the search to one
 * region — use them to measure a cartouche or a banner inside the frame, which
 * a whole-image search would never return because the middle of the page is
 * always the larger rectangle.
 *
 * Prints the box as fractions of page width/height, ready to paste into
 * src/lib/walletKinds.ts. Pure Node (zlib only) — 8-bit non-interlaced PNG only.
 */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';

function parsePNG(buf) {
  let p = 8, idat = [];
  let width = 0, height = 0, colorType = 0, bitDepth = 0;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.slice(p, p + 4).toString(); p += 4;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p); height = buf.readUInt32BE(p + 4);
      bitDepth = buf[p + 8]; colorType = buf[p + 9];
    } else if (type === 'IDAT') {
      idat.push(buf.slice(p, p + len));
    } else if (type === 'IEND') break;
    p += len + 4;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      let cur = raw[off + x];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[rowStart - stride + x] : 0;
      const upLeft = (x >= channels && y > 0) ? pixels[rowStart - stride + x - channels] : 0;
      if (filter === 1) cur = (cur + left) & 0xff;
      else if (filter === 2) cur = (cur + up) & 0xff;
      else if (filter === 3) cur = (cur + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const pred = left + up - upLeft;
        const pa = Math.abs(pred - left), pb = Math.abs(pred - up), pc = Math.abs(pred - upLeft);
        const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
        cur = (cur + pr) & 0xff;
      }
      pixels[rowStart + x] = cur;
    }
    off += stride;
  }
  return { width, height, channels, pixels };
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/find-content-box.mjs <ornament.png> [threshold] [inset]');
  process.exit(1);
}
const thresh = parseInt(process.argv[3] || '248');
const inset = parseFloat(process.argv[4] || '0.012');
const img = parsePNG(readFileSync(file));
const { width: W, height: H, channels: C, pixels } = img;

const region = process.argv.slice(5, 9).map(Number);
const [rx0, ry0, rx1, ry1] = region.length === 4 ? region : [0, 0, 1, 1];
const bx0 = Math.round(rx0 * W), bx1 = Math.round(rx1 * W);
const by0 = Math.round(ry0 * H), by1 = Math.round(ry1 * H);

// Binary white mask. Anything outside the requested region counts as ink, so
// the rectangle can never grow past it.
const white = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const inRegion = x >= bx0 && x < bx1 && y >= by0 && y < by1;
    white[y * W + x] = inRegion && pixels[i] >= thresh && pixels[i + (C > 2 ? 1 : 0)] >= thresh && pixels[i + (C > 2 ? 2 : 0)] >= thresh ? 1 : 0;
  }
}

// Maximal all-white rectangle: histogram of white heights + largest-rectangle-in-histogram per row.
const heights = new Int32Array(W);
let best = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) heights[x] = white[y * W + x] ? heights[x] + 1 : 0;
  const stack = [];
  for (let x = 0; x <= W; x++) {
    const h = x === W ? 0 : heights[x];
    let start = x;
    while (stack.length && stack[stack.length - 1].h >= h) {
      const top = stack.pop();
      const area = top.h * (x - top.x);
      if (area > best.area) best = { area, x0: top.x, x1: x - 1, y0: y - top.h + 1, y1: y };
      start = top.x;
    }
    stack.push({ x: start, h });
  }
}

const f = (v) => v.toFixed(4);
const x = best.x0 / W + inset;
const y = best.y0 / H + inset;
const w = (best.x1 - best.x0 + 1) / W - inset * 2;
const h = (best.y1 - best.y0 + 1) / H - inset * 2;

console.log(`${file}  ${W}x${H} ch=${C} thresh>=${thresh}`);
console.log(`raw box: x ${(best.x0 / W * 100).toFixed(2)}%–${(best.x1 / W * 100).toFixed(2)}%  y ${(best.y0 / H * 100).toFixed(2)}%–${(best.y1 / H * 100).toFixed(2)}%`);
console.log(`content box (inset ${inset}):`);
console.log(`  contentBox: { x: ${f(x)}, y: ${f(y)}, w: ${f(w)}, h: ${f(h)} },`);
