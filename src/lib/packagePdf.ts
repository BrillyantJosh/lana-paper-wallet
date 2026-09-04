import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { STR } from './packageStrings';
import type { Bilingual } from './packageStrings';
import {
  COVER_ORNAMENT,
  WALLET_KINDS,
  walletKind,
} from './walletKinds';
import type { Box, PackageDraft, WalletEntry, WalletKindId } from './walletKinds';
import { GARAMOND, MONO, preloadPdfFonts, registerPdfFonts } from './pdfFonts';

export interface PackagePdfInput {
  draft: PackageDraft;
  entries: WalletEntry[];
  issuedOn: Date;
}

/* ── page geometry ─────────────────────────────────────────────────────── */

/** Where the ornament sits: inside the printer-safe area, never bleeding. */
const ORN = { x: 11.333, y: 8.0, w: 187.333, h: 281.0 };

/** 1 pt in mm. */
const PT = 0.352778;

/** Cap height and descender as a fraction of the em, per face. */
const CAP = { [GARAMOND]: 0.66, [MONO]: 0.7 } as Record<string, number>;
const DESC = { [GARAMOND]: 0.27, [MONO]: 0.3 } as Record<string, number>;

const JOIN = ' · ';
const TIMES = '× ';
const ELLIPSIS = '…';

/** The one block every wallet page draws into — identical on all four kinds. */
const P = {
  x0: 57.1,
  x1: 153.3,
  w: 96.2,
  addrX: 57.1,
  addrW: 33.0,
  addrCx: 73.6,
  keyX: 97.3,
  keyW: 56.0,
  keyCx: 125.3,
  headX: 65.9,
};

/** The cover's block, and the inner rail its contents list runs on. */
const C = {
  x0: 46.9,
  x1: 163.3,
  w: 116.4,
  cx: 105.1,
  railL: 66.9,
  railR: 143.3,
  railW: 76.4,
};

type MmBox = { x0: number; y0: number; x1: number; y1: number };

function boxToMm(b: Box): MmBox {
  return {
    x0: ORN.x + b.x * ORN.w,
    y0: ORN.y + b.y * ORN.h,
    x1: ORN.x + (b.x + b.w) * ORN.w,
    y1: ORN.y + (b.y + b.h) * ORN.h,
  };
}

/* ── the guard ─────────────────────────────────────────────────────────── */

const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * The whole design rests on nothing being drawn outside the engraving's clear
 * middle. In development every rectangle is checked against the content box of
 * the ornament it lands on, so whoever edits the layout next finds out at once
 * that they pushed an element onto the ink.
 */
function assertInside(
  name: string,
  box: MmBox,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!DEV) return;
  const EPS = 0.02;
  if (x < box.x0 - EPS || y < box.y0 - EPS || x + w > box.x1 + EPS || y + h > box.y1 + EPS) {
    console.warn(
      `[packagePdf] "${name}" leaves the content box: ` +
        `drawn ${x.toFixed(2)},${y.toFixed(2)} → ${(x + w).toFixed(2)},${(y + h).toFixed(2)}; ` +
        `box ${box.x0.toFixed(2)},${box.y0.toFixed(2)} → ${box.x1.toFixed(2)},${box.y1.toFixed(2)}`,
    );
  }
}

/* ── drawing helpers ───────────────────────────────────────────────────── */

type Align = 'left' | 'center' | 'right';

interface Ctx {
  doc: jsPDF;
  box: MmBox;
}

function text(
  ctx: Ctx,
  name: string,
  content: string,
  x: number,
  y: number,
  align: Align,
  family: string,
  style: 'normal' | 'bold',
  size: number,
): void {
  if (!content) return;
  const { doc } = ctx;
  doc.setFont(family, style);
  doc.setFontSize(size);
  const w = doc.getTextWidth(content);
  const left = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  const top = y - CAP[family] * size * PT;
  const h = (CAP[family] + DESC[family]) * size * PT;
  assertInside(name, ctx.box, left, top, w, h);
  doc.text(content, x, y, { align });
}

function rule(
  ctx: Ctx,
  name: string,
  x0: number,
  x1: number,
  y: number,
  weight: number,
): void {
  const { doc } = ctx;
  assertInside(name, ctx.box, x0, y - weight / 2, x1 - x0, weight);
  doc.setLineWidth(weight);
  doc.line(x0, y, x1, y);
}

function image(
  ctx: Ctx,
  name: string,
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
  alias?: string,
): void {
  assertInside(name, ctx.box, x, y, w, h);
  ctx.doc.addImage(dataUrl, 'PNG', x, y, w, h, alias, 'FAST');
}

/**
 * Steps the size down by 0.5 pt until the string fits, never below the floor,
 * then truncates with an ellipsis. The baseline never moves.
 */
function fitOneLine(
  doc: jsPDF,
  content: string,
  family: string,
  style: 'normal' | 'bold',
  startPt: number,
  maxMm: number,
  floorPt: number,
): { text: string; size: number } {
  doc.setFont(family, style);
  let size = startPt;
  doc.setFontSize(size);
  while (doc.getTextWidth(content) > maxMm && size > floorPt) {
    size = Math.max(floorPt, size - 0.5);
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(content) <= maxMm) return { text: content, size };
  let out = content;
  while (out.length > 1 && doc.getTextWidth(out + ELLIPSIS) > maxMm) out = out.slice(0, -1);
  return { text: out + ELLIPSIS, size };
}

/** Two lines at most, ever — the description is a caption, not a letter. */
function twoLines(
  doc: jsPDF,
  content: string,
  family: string,
  style: 'normal' | 'bold',
  pt: number,
  fallbackPt: number,
  maxMm: number,
): { lines: string[]; size: number } {
  const trimmed = (content || '').trim();
  if (!trimmed) return { lines: [], size: pt };
  doc.setFont(family, style);
  doc.setFontSize(pt);
  let lines = doc.splitTextToSize(trimmed, maxMm) as string[];
  if (lines.length <= 2) return { lines, size: pt };
  doc.setFontSize(fallbackPt);
  lines = doc.splitTextToSize(trimmed, maxMm) as string[];
  if (lines.length <= 2) return { lines, size: fallbackPt };
  let second = lines[1];
  while (second.length > 1 && doc.getTextWidth(second + ELLIPSIS) > maxMm) {
    second = second.slice(0, -1);
  }
  return { lines: [lines[0], second + ELLIPSIS], size: fallbackPt };
}

const pair = (b: Bilingual): string => b.sl + JOIN + b.en;

/**
 * Fixed character offsets, not measured widths, so the break sits in the same
 * place on every page in a stack. Nothing is drawn at the break.
 */
function splitAt(s: string, at: number): [string, string] {
  const cut = s.length === at * 2 ? at : Math.ceil(s.length / 2);
  return [s.slice(0, cut), s.slice(cut)];
}

/* ── assets ────────────────────────────────────────────────────────────── */

const MARK_URL = '/lana-mark.png';

/**
 * Each ornament and the emblem are fetched once and held as a data URL. Passing
 * the same string with the same alias on every page is what makes jsPDF store a
 * 0.9 MB engraving once instead of sixty-one times.
 */
const assets = new Map<string, Promise<string>>();

function loadAsset(url: string): Promise<string> {
  let pending = assets.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const CHUNK = 0x2000;
      let binary = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      return `data:image/png;base64,${btoa(binary)}`;
    })().catch((err) => {
      assets.delete(url);
      throw err;
    });
    assets.set(url, pending);
  }
  return pending;
}

/**
 * Each QR gets an explicit alias at the call site. Left to itself jsPDF names an
 * image by a 32-bit hash of its pixels and reuses any earlier image with the
 * same name — on a 60-wallet sheet that is 122 images gambling on a 32-bit
 * space, and the prize for losing is one wallet's code printed beside another
 * wallet's ink.
 */
function qr(content: string, level: 'M' | 'Q'): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: level,
    margin: 0,
    scale: 20,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

/* ── public API ────────────────────────────────────────────────────────── */

/** Cover, then one page per wallet. */
export function packagePageCount(entries: WalletEntry[]): number {
  return 1 + entries.length;
}

const TRANSLITERATE: Record<string, string> = {
  č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd',
  á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ï: 'i', ó: 'o', ö: 'o', ô: 'o', ú: 'u', ü: 'u', ñ: 'n',
};

export function packagePdfFileName(draft: PackageDraft): string {
  const slug = (draft.fullName || '')
    .toLowerCase()
    .replace(/[^\x00-\x7f]/g, (ch) => TRANSLITERATE[ch] ?? '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug ? `lana-paper-wallets-${slug}.pdf` : 'lana-paper-wallets.pdf';
}

/** YYYY-MM-DD in the reader's own day, not UTC. */
function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function countByKind(entries: WalletEntry[]): Record<WalletKindId, number> {
  const counts = {} as Record<WalletKindId, number>;
  for (const entry of entries) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  return counts;
}

/**
 * Warms the caches for a package that is being filled in. Six megabytes of
 * engraving and a megabyte of font is a twenty-second wait if it all starts at
 * the moment someone presses Download; started while they are still typing
 * keys, it is finished before they get there.
 *
 * Safe to call repeatedly and safe to ignore: every failure is swallowed, and
 * buildPackagePdf fetches whatever is still missing.
 */
export function prefetchPackageAssets(kindIds: WalletKindId[]): void {
  const urls = [
    MARK_URL,
    COVER_ORNAMENT.ornamentUrl,
    ...WALLET_KINDS.filter((k) => kindIds.includes(k.id)).map((k) => k.ornamentUrl),
  ];
  for (const url of urls) void loadAsset(url).catch(() => undefined);
  void preloadPdfFonts().catch(() => undefined);
}

export async function buildPackagePdf(input: PackagePdfInput): Promise<Blob> {
  const { draft, entries, issuedOn } = input;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  await registerPdfFonts(doc);
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setFillColor(0, 0, 0);

  const counts = countByKind(entries);
  const usedKinds = WALLET_KINDS.filter((k) => (counts[k.id] ?? 0) > 0);

  // Every image the document needs, fetched once and reused by alias.
  const [mark, coverOrn, ...kindOrns] = await Promise.all([
    loadAsset(MARK_URL),
    loadAsset(COVER_ORNAMENT.ornamentUrl),
    ...usedKinds.map((k) => loadAsset(k.ornamentUrl)),
  ]);
  const ornByKind = new Map<WalletKindId, string>();
  usedKinds.forEach((k, i) => ornByKind.set(k.id, kindOrns[i]));

  const totalPages = packagePageCount(entries);

  drawCover(doc, draft, counts, usedKinds.map((k) => k.id), issuedOn, mark, coverOrn);

  for (let i = 0; i < entries.length; i++) {
    doc.addPage('a4', 'portrait');
    await drawWalletPage(
      doc,
      draft,
      entries[i],
      counts[entries[i].kind] ?? 1,
      i + 2,
      totalPages,
      mark,
      ornByKind.get(entries[i].kind) as string,
    );
  }

  return doc.output('blob');
}

/* ── the cover ─────────────────────────────────────────────────────────── */

function drawCover(
  doc: jsPDF,
  draft: PackageDraft,
  counts: Record<WalletKindId, number>,
  kindIds: WalletKindId[],
  issuedOn: Date,
  mark: string,
  ornament: string,
): void {
  doc.addImage(ornament, 'PNG', ORN.x, ORN.y, ORN.w, ORN.h, 'orn-cover', 'FAST');

  const ctx: Ctx = { doc, box: boxToMm(COVER_ORNAMENT.contentBox) };

  // The emblem goes into the engraved oval at the crown of the arch, which sits
  // far above the content box — so it is checked against the cartouche instead.
  const oval: Ctx = { doc, box: boxToMm(COVER_ORNAMENT.cartouche) };
  image(oval, 'cover emblem', mark, 96.23, 39.15, 17.83, 21.0, 'mark');

  text(ctx, 'cover title SL', STR.pdfCoverTitle.sl, C.cx, 100.4, 'center', GARAMOND, 'bold', 24);
  text(ctx, 'cover title EN', STR.pdfCoverTitle.en, C.cx, 108.4, 'center', GARAMOND, 'normal', 13);
  rule(ctx, 'cover rule B', C.x0, C.x1, 113.4, 0.4);

  text(ctx, 'cover owner label', pair(STR.pdfCoverOwner), C.cx, 121.4, 'center', GARAMOND, 'normal', 8.5);
  const owner = fitOneLine(doc, draft.fullName || '', GARAMOND, 'bold', 17, C.w, 12);
  text(ctx, 'cover owner', owner.text, C.cx, 130.0, 'center', GARAMOND, 'bold', owner.size);

  // Empty description leaves both rows blank and moves nothing below it.
  const desc = twoLines(doc, draft.description, GARAMOND, 'normal', 10.5, 9, C.w);
  if (desc.lines[0]) {
    text(ctx, 'cover description L1', desc.lines[0], C.cx, 137.4, 'center', GARAMOND, 'normal', desc.size);
  }
  if (desc.lines[1]) {
    text(ctx, 'cover description L2', desc.lines[1], C.cx, 142.0, 'center', GARAMOND, 'normal', desc.size);
  }

  rule(ctx, 'cover rule C', C.railL, C.railR, 147.0, 0.15);
  text(ctx, 'cover contents label', pair(STR.pdfCoverContents), C.cx, 154.0, 'center', GARAMOND, 'normal', 8.5);

  // Four slots, always 6.0 mm apart; unused slots are simply not drawn.
  kindIds.slice(0, 4).forEach((id, i) => {
    const kind = walletKind(id);
    const y = 162.0 + i * 6.0;
    text(ctx, `cover contents ${id}`, pair(kind.name), C.railL, y, 'left', GARAMOND, 'normal', 11);
    text(ctx, `cover count ${id}`, TIMES + counts[id], C.railR, y, 'right', GARAMOND, 'normal', 11);
  });

  rule(ctx, 'cover rule D', C.railL, C.railR, 186.0, 0.15);
  text(ctx, 'cover issued label', pair(STR.pdfCoverIssued), C.cx, 193.0, 'center', GARAMOND, 'normal', 8.5);
  text(ctx, 'cover issued date', isoDate(issuedOn), C.cx, 200.0, 'center', MONO, 'normal', 10);

  text(ctx, 'cover safety SL', STR.keySafety.sl, C.cx, 208.0, 'center', GARAMOND, 'normal', 8);
  text(ctx, 'cover safety EN', STR.keySafety.en, C.cx, 211.7, 'center', GARAMOND, 'normal', 8);
  text(ctx, 'cover footer', STR.pdfFooter.sl, C.cx, 216.4, 'center', GARAMOND, 'normal', 8);
}

/* ── a wallet page ─────────────────────────────────────────────────────── */

async function drawWalletPage(
  doc: jsPDF,
  draft: PackageDraft,
  entry: WalletEntry,
  countOfKind: number,
  pageNumber: number,
  totalPages: number,
  mark: string,
  ornament: string,
): Promise<void> {
  const kind = walletKind(entry.kind);
  doc.addImage(ornament, 'PNG', ORN.x, ORN.y, ORN.w, ORN.h, `orn-${kind.id}`, 'FAST');

  const ctx: Ctx = { doc, box: boxToMm(kind.contentBox) };

  // Header.
  image(ctx, 'emblem', mark, P.x0, 111.2, 5.944, 7.0, 'mark');
  const name = fitOneLine(doc, kind.name.sl, GARAMOND, 'bold', 13, 44.4, 10);
  text(ctx, 'kind name SL', name.text, P.headX, 115.5, 'left', GARAMOND, 'bold', name.size);

  // Drawn whenever the package holds more than one of this kind — that is what
  // makes a stack of forty otherwise identical sheets sortable by hand.
  if (countOfKind > 1) {
    text(
      ctx,
      'position',
      pair(STR.pdfPositionOf(entry.position, countOfKind)),
      P.x1,
      115.5,
      'right',
      MONO,
      'normal',
      9,
    );
  }

  text(ctx, 'kind name EN', kind.name.en, P.headX, 118.8, 'left', GARAMOND, 'normal', 8.5);
  text(ctx, 'tagline', pair(kind.tagline), P.x0, 122.1, 'left', GARAMOND, 'normal', 7);
  rule(ctx, 'header rule', P.x0, P.x1, 124.1, 0.3);

  const owner = fitOneLine(doc, draft.fullName || '', GARAMOND, 'bold', 13, P.w, 10);
  text(ctx, 'owner', owner.text, P.x0, 128.5, 'left', GARAMOND, 'bold', owner.size);

  const desc = twoLines(doc, draft.description, GARAMOND, 'normal', 8.5, 7.5, P.w);
  if (desc.lines[0]) {
    text(ctx, 'description L1', desc.lines[0], P.x0, 132.7, 'left', GARAMOND, 'normal', desc.size);
  }
  if (desc.lines[1]) {
    text(ctx, 'description L2', desc.lines[1], P.x0, 136.3, 'left', GARAMOND, 'normal', desc.size);
  }

  // The two caption bars. The address is outlined, the private key is a solid
  // black tab with reversed type — a binary signal that survives a photocopier.
  assertInside('address bar', ctx.box, P.addrX, 138.9, P.addrW, 9.0);
  doc.setLineWidth(0.35);
  doc.rect(P.addrX, 138.9, P.addrW, 9.0, 'S');
  assertInside('key bar', ctx.box, P.keyX, 138.9, P.keyW, 9.0);
  doc.rect(P.keyX, 138.9, P.keyW, 9.0, 'F');

  text(ctx, 'address caption SL', STR.pdfWalletAddress.sl, 60.1, 142.4, 'left', GARAMOND, 'bold', 9);
  text(ctx, 'address caption EN', STR.pdfWalletAddress.en, 60.1, 145.4, 'left', GARAMOND, 'normal', 7);

  doc.setTextColor(255, 255, 255);
  text(ctx, 'key caption SL', STR.pdfPrivateKey.sl, 100.3, 142.4, 'left', GARAMOND, 'bold', 9);
  text(ctx, 'key caption EN', STR.pdfPrivateKey.en, 100.3, 145.4, 'left', GARAMOND, 'normal', 7);
  doc.setTextColor(0);

  text(ctx, 'scan to receive', pair(STR.pdfScanToReceive), P.addrCx, 150.6, 'center', GARAMOND, 'normal', 6.5);
  text(ctx, 'scan to spend', pair(STR.pdfScanToSpend), P.keyCx, 150.6, 'center', GARAMOND, 'normal', 6.5);

  // The address can be re-derived from the key, so it can afford level M; the
  // key cannot be recovered from anything, so it gets Q's 25 % damage tolerance.
  const address = entry.address ?? '';
  const wif = entry.wif ?? '';
  const [addressQr, keyQr] = await Promise.all([qr(address, 'M'), qr(wif, 'Q')]);
  image(ctx, 'address QR', addressQr, 61.35, 155.2, 24.5, 24.5, `qr-a-${entry.uid}`);
  image(ctx, 'key QR', keyQr, 110.3, 155.2, 30.0, 30.0, `qr-k-${entry.uid}`);

  const [a1, a2] = splitAt(address, 17);
  text(ctx, 'address line 1', a1, P.addrCx, 191.3, 'center', MONO, 'normal', 8.5);
  text(ctx, 'address line 2', a2, P.addrCx, 195.5, 'center', MONO, 'normal', 8.5);

  const [k1, k2] = splitAt(wif, 26);
  text(ctx, 'wif line 1', k1, P.keyCx, 191.3, 'center', MONO, 'normal', 9.5);
  text(ctx, 'wif line 2', k2, P.keyCx, 195.5, 'center', MONO, 'normal', 9.5);

  rule(ctx, 'address hairline', P.addrX, P.addrX + P.addrW, 197.7, 0.15);
  rule(ctx, 'key rule', P.keyX, P.keyX + P.keyW, 197.7, 1.0);

  text(ctx, 'safety SL', STR.keySafety.sl, P.x0, 200.5, 'left', GARAMOND, 'normal', 6.5);
  text(ctx, 'safety EN', STR.keySafety.en, P.x0, 203.6, 'left', GARAMOND, 'normal', 6.5);
  text(ctx, 'footer', STR.pdfFooter.sl, P.x0, 206.7, 'left', GARAMOND, 'normal', 6.5);
  text(
    ctx,
    'page of',
    pair(STR.pdfPageOf(pageNumber, totalPages)),
    P.x1,
    206.7,
    'right',
    GARAMOND,
    'normal',
    6.5,
  );
}
