/**
 * Prepares a generated ornament template for print: converts it to 8-bit
 * grayscale and lifts the paper to pure white, so a printer lays down ink only
 * where the engraving actually is (an untouched template washes the whole sheet
 * with a faint grey).
 *
 * Usage:  node tools/prep-ornament.mjs <in.png> <out.png>
 *
 * Pure Node (zlib only). 8-bit non-interlaced PNG in, 8-bit grayscale PNG out.
 */
import { readFileSync, writeFileSync } from 'fs';
import { inflateSync, deflateSync } from 'zlib';

function parsePNG(buf) {
  let p = 8; const idat = [];
  let width = 0, height = 0, colorType = 0, bitDepth = 0;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.slice(p, p + 4).toString(); p += 4;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p); height = buf.readUInt32BE(p + 4);
      bitDepth = buf[p + 8]; colorType = buf[p + 9];
    } else if (type === 'IDAT') idat.push(buf.slice(p, p + len));
    else if (type === 'IEND') break;
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

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function writeGrayPNG(path, width, height, gray) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width + 1)] = 0;
    gray.copy(rows, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node tools/prep-ornament.mjs <in.png> <out.png>');
  process.exit(1);
}

const img = parsePNG(readFileSync(inPath));
const { width, height, channels, pixels } = img;
const gray = Buffer.alloc(width * height);

// Paper lift: everything from KNEE up is pulled to pure white, the shoulder
// below it is ramped so hatching keeps its gradation instead of banding.
const KNEE = 200, WHITE = 240;
let lifted = 0;
for (let i = 0, n = width * height; i < n; i++) {
  const o = i * channels;
  let v = channels >= 3
    ? Math.round(0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2])
    : pixels[o];
  if (v >= WHITE) { v = 255; lifted++; }
  else if (v > KNEE) v = Math.round(KNEE + (v - KNEE) * ((255 - KNEE) / (WHITE - KNEE)));
  gray[i] = v;
}

writeGrayPNG(outPath, width, height, gray);
console.log(`${outPath}  ${width}x${height} grayscale, ${(lifted / (width * height) * 100).toFixed(1)}% of the sheet lifted to pure white`);
