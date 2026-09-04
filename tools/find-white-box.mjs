/**
 * Locates the white QR drop-zone in a theme's back-page template.
 *
 * Usage:  node tools/find-white-box.mjs <back-image.png> [threshold=250]
 *
 * Prints the box bounds and the cx / cy / sizeRatio values to paste into
 * src/lib/themes.ts. Pure Node (zlib only) — no image libraries needed.
 * Only 8-bit non-interlaced PNGs are supported; `sips -s format png` output works.
 */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';

function parsePNG(buf) {
  let p = 8, idat = Buffer.alloc(0);
  let width = 0, height = 0, colorType = 0, bitDepth = 0;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.slice(p, p + 4).toString(); p += 4;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p); height = buf.readUInt32BE(p + 4);
      bitDepth = buf[p + 8]; colorType = buf[p + 9];
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, buf.slice(p, p + len)]);
    } else if (type === 'IEND') break;
    p += len + 4;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const raw = inflateSync(idat);
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
  console.error('usage: node tools/find-white-box.mjs <back-image.png> [threshold]');
  process.exit(1);
}
const img = parsePNG(readFileSync(file));
const thresh = parseInt(process.argv[3] || '250');
const minRun = Math.floor(img.width * 0.15);

// Longest run of consecutive white pixels per row — the box body, not stray highlights.
const rowRuns = [];
for (let y = 0; y < img.height; y++) {
  let bestStart = -1, bestEnd = -1, bestLen = 0, runStart = -1;
  for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * img.channels;
    const isWhite = img.pixels[i] >= thresh && img.pixels[i + 1] >= thresh && img.pixels[i + 2] >= thresh;
    if (isWhite) { if (runStart < 0) runStart = x; }
    else if (runStart >= 0) {
      const len = x - runStart;
      if (len > bestLen) { bestLen = len; bestStart = runStart; bestEnd = x - 1; }
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = img.width - runStart;
    if (len > bestLen) { bestLen = len; bestStart = runStart; bestEnd = img.width - 1; }
  }
  rowRuns.push({ start: bestStart, end: bestEnd, len: bestLen, y });
}

const good = rowRuns.filter(r => r.len >= minRun);
if (!good.length) { console.log('no white box found — try a lower threshold'); process.exit(0); }

// Group adjacent rows, keep the tallest band.
const clusters = [[good[0]]];
for (let i = 1; i < good.length; i++) {
  if (good[i].y - good[i - 1].y <= 5) clusters[clusters.length - 1].push(good[i]);
  else clusters.push([good[i]]);
}
clusters.sort((a, b) => b.length - a.length);
const band = clusters[0];
const yStart = band[0].y, yEnd = band[band.length - 1].y;
const xs = band.map(r => r.start).sort((a, b) => a - b);
const xe = band.map(r => r.end).sort((a, b) => a - b);
const x0 = xs[Math.floor(xs.length / 2)], x1 = xe[Math.floor(xe.length / 2)];

const shorter = Math.min(img.width, img.height);
const cx = (x0 + x1) / 2 / img.width;
const cy = (yStart + yEnd) / 2 / img.height;
const boxW = (x1 - x0) / shorter;
const boxH = (yEnd - yStart) / shorter;
const pct = (v, d) => (v / d * 100).toFixed(2);

console.log(`${file}  ${img.width}x${img.height} ch=${img.channels} thresh>=${thresh}`);
console.log(`white box: x=${pct(x0, img.width)}%-${pct(x1, img.width)}%  y=${pct(yStart, img.height)}%-${pct(yEnd, img.height)}%`);
console.log(`box vs shorter side: w=${boxW.toFixed(3)}  h=${boxH.toFixed(3)}`);
console.log('');
console.log('themes.ts qrArea:');
console.log(`  cx: ${cx.toFixed(3)},`);
console.log(`  cy: ${cy.toFixed(3)},`);
console.log(`  sizeRatio: ${(Math.min(boxW, boxH) * 0.85).toFixed(2)}, // ~85% fill of the box`);
