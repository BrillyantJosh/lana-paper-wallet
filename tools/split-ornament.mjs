/**
 * Cuts a generated ornament sheet into the two pieces the PDF actually places:
 * the mandala CROWN and the small FOOTER motif, each trimmed to its own ink.
 *
 * Usage:  node tools/split-ornament.mjs <sheet.png> <outDir> <id> [inset] [white]
 *   → <outDir>/<id>-crown.png and <outDir>/<id>-footer.png
 *
 * `inset` (a fraction, default 0) ignores that much of each edge. Some sheets
 * come back rendered as a photograph of a piece of paper lying on a surface;
 * the paper's own edge and its shadow are ink as far as this tool is concerned,
 * and would be cropped in along with the engraving.
 *
 * Why cut them apart at all: a full-page ornament forces every page's text into
 * whatever gap the picture happens to leave, and that gap was never the same
 * twice. Placed as two trimmed pieces, the crown sits where the layout wants it
 * and the middle of the sheet is simply empty — the same generous rectangle on
 * every wallet kind, with no measuring.
 *
 * The paper is lifted to pure white on the way through, so a printer lays down
 * ink only where the engraving is; that is also what makes these compress.
 *
 * Pure Node (zlib only). 8-bit non-interlaced PNG in, 8-bit greyscale PNG out.
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
  ihdr[8] = 8; ihdr[9] = 0;
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

const [inPath, outDir, id, insetArg, whiteArg] = process.argv.slice(2);
if (!inPath || !outDir || !id) {
  console.error('usage: node tools/split-ornament.mjs <sheet.png> <outDir> <id> [inset]');
  process.exit(64);
}
const inset = Math.min(0.4, Math.max(0, parseFloat(insetArg || '0')));
/**
 * Everything this bright counts as paper. Some sheets come back with the page
 * itself rendered a shade off-white; left alone that shade survives the crop and
 * prints as a faint grey rectangle behind the engraving.
 */
const WHITE = Math.min(255, Math.max(200, parseInt(whiteArg || '234', 10)));

const img = parsePNG(readFileSync(inPath));
const { width: W, height: H, channels: C, pixels } = img;

// Paper lift: everything from WHITE up becomes pure white, the shoulder below it
// is ramped so hatching keeps its gradation instead of banding.
const KNEE = 190;
const gray = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) {
  const o = i * C;
  let v = C >= 3
    ? Math.round(0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2])
    : pixels[o];
  if (v >= WHITE) v = 255;
  else if (v > KNEE) v = Math.round(KNEE + (v - KNEE) * ((255 - KNEE) / (WHITE - KNEE)));
  gray[i] = v;
}

// A row counts as inked once it carries more than a stray speck, so that JPEG-ish
// noise in the paper does not weld the two motifs into one band.
const INK = 200;
const MIN_PER_ROW = Math.max(3, Math.round(W * 0.002));
const bx0 = Math.round(W * inset), bx1 = W - 1 - Math.round(W * inset);
const by0 = Math.round(H * inset), by1 = H - 1 - Math.round(H * inset);
const isInk = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && gray[y * W + x] < INK;
const inked = new Uint8Array(H);
for (let y = 0; y < H; y++) {
  let n = 0;
  for (let x = 0; x < W; x++) if (isInk(x, y)) n++;
  inked[y] = n >= MIN_PER_ROW ? 1 : 0;
}

// Group inked rows into bands, allowing a small gap so a mandala's outer ring of
// separate dots still belongs to the mandala.
const GAP = Math.round(H * 0.02);
const bands = [];
for (let y = 0; y < H; y++) {
  if (!inked[y]) continue;
  const last = bands[bands.length - 1];
  if (last && y - last.y1 <= GAP) last.y1 = y;
  else bands.push({ y0: y, y1: y });
}
if (bands.length < 2) {
  console.error(`expected a crown and a footer motif, found ${bands.length} band(s) — check the sheet`);
  process.exit(1);
}
// The crown is the tallest band, and the footer the tallest of what is left
// BELOW it. Taking simply the last band picks up a stray hairline — the shadow
// under a photographed sheet, say — and crops a 45-pixel strip instead of the
// motif.
const crownBand = bands.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a));
const below = bands.filter((b) => b.y0 > crownBand.y1);
if (below.length === 0) {
  console.error('found a crown but nothing below it — check the sheet');
  process.exit(1);
}
const footerBand = below.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a));
if (bands.length > 2) {
  console.log(`note: ${bands.length} ink bands on the sheet; took the tallest as the crown and the tallest below it as the footer`);
}

/** Trims a row band to the ink inside it and writes it out. */
function emit(band, suffix) {
  let x0 = W, x1 = -1;
  for (let y = band.y0; y <= band.y1; y++) {
    for (let x = 0; x < W; x++) {
      if (isInk(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
  }
  const pad = Math.max(2, Math.round(W * 0.004));
  x0 = Math.max(0, x0 - pad); x1 = Math.min(W - 1, x1 + pad);
  const y0 = Math.max(0, band.y0 - pad), y1 = Math.min(H - 1, band.y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) gray.copy(out, y * w, (y0 + y) * W + x0, (y0 + y) * W + x0 + w);
  const path = `${outDir}/${id}-${suffix}.png`;
  writeGrayPNG(path, w, h, out);
  console.log(`${path}  ${w}x${h}  aspect w/h = ${(w / h).toFixed(4)}`);
}

emit(crownBand, 'crown');
emit(footerBand, 'footer');
