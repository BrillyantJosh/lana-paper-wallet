import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { STR, t } from './packageStrings';
import type { Lang } from './packageStrings';
import {
  COVER_ORNAMENT,
  WALLET_KINDS,
  walletKind,
} from './walletKinds';
import type { Ornament, PackageDraft, WalletEntry, WalletKindId } from './walletKinds';
import { GARAMOND, MONO, preloadPdfFonts, registerPdfFonts } from './pdfFonts';

export interface PackagePdfInput {
  draft: PackageDraft;
  entries: WalletEntry[];
  issuedOn: Date;
}

/* ── page geometry ─────────────────────────────────────────────────────── */

/**
 * A4, with a printer-safe margin: most home printers clip about 5 mm, so
 * nothing is drawn outside these bounds.
 */
const PAGE = { w: 210, h: 297 };

/**
 * The mandala at the top and the small motif at the bottom are placed by the
 * layout rather than being part of a full-page picture, so the middle of every
 * sheet is the same generous empty rectangle whatever kind of wallet it is.
 */
const CROWN = { h: 64, top: 14 };
const FOOTER = { h: 13, bottom: 279 };

/** Everything the page writes goes in here — 166 × 176 mm, the same on every kind. */
const A = {
  x0: 22,
  x1: 188,
  // Four millimetres clear of the crown, which ends at CROWN.top + CROWN.h.
  y0: 82,
  y1: 258,
  cx: 105,
  /** The two code columns, with a gutter between them. */
  leftX0: 22,
  leftX1: 98,
  leftCx: 60,
  rightX0: 112,
  rightX1: 188,
  rightCx: 150,
  colW: 76,
};

/** The cover writes into the same rectangle, on a narrower rail. */
const C = {
  x0: 22,
  x1: 188,
  cx: 105,
  railL: 52,
  railR: 158,
  railW: 106,
  w: 166,
};

/** 1 pt in mm. */
const PT = 0.352778;

/** Cap height and descender as a fraction of the em, per face. */
const CAP = { [GARAMOND]: 0.66, [MONO]: 0.7 } as Record<string, number>;
const DESC = { [GARAMOND]: 0.27, [MONO]: 0.3 } as Record<string, number>;

const TIMES = '× ';
const ELLIPSIS = '…';

type MmBox = { x0: number; y0: number; x1: number; y1: number };

/** The writing area, as the guard sees it. */
const CONTENT_BOX: MmBox = { x0: A.x0, y0: A.y0, x1: A.x1, y1: A.y1 };

/* ── the guard ─────────────────────────────────────────────────────────── */

const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * Nothing may be drawn outside the writing area — the ornaments sit above and
 * below it, and text that strays lands on the engraving. In development every
 * rectangle is checked, so whoever edits the layout next finds out at once.
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

/** The trimmed emblem is 180 × 212 px. */
const MARK_ASPECT = 180 / 212;

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
    COVER_ORNAMENT.crown.url,
    COVER_ORNAMENT.footer.url,
    ...WALLET_KINDS.filter((k) => kindIds.includes(k.id)).flatMap((k) => [k.crown.url, k.footer.url]),
  ];
  for (const url of urls) void loadAsset(url).catch(() => undefined);
  void preloadPdfFonts().catch(() => undefined);
}
export async function buildPackagePdf(input: PackagePdfInput): Promise<Blob> {
  const { draft, entries, issuedOn } = input;
  const lang = draft.docLang;

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

  // Every image the document needs, fetched once and reused by alias. jsPDF
  // stores an aliased image a single time however many pages draw it.
  const wanted = [
    MARK_URL,
    COVER_ORNAMENT.crown.url,
    COVER_ORNAMENT.footer.url,
    ...usedKinds.flatMap((k) => [k.crown.url, k.footer.url]),
  ];
  const loaded = new Map<string, string>();
  await Promise.all(
    [...new Set(wanted)].map(async (url) => loaded.set(url, await loadAsset(url))),
  );
  const asset = (url: string): string => {
    const data = loaded.get(url);
    if (!data) throw new Error(`asset not loaded: ${url}`);
    return data;
  };

  const totalPages = packagePageCount(entries);

  drawCover(doc, lang, draft, counts, usedKinds.map((k) => k.id), issuedOn, asset);

  for (let i = 0; i < entries.length; i++) {
    doc.addPage('a4', 'portrait');
    await drawWalletPage(
      doc,
      lang,
      draft,
      entries[i],
      counts[entries[i].kind] ?? 1,
      i + 2,
      totalPages,
      asset,
    );
  }

  return doc.output('blob');
}

/* ── the engraving ─────────────────────────────────────────────────────── */

type AssetFn = (url: string) => string;

/** Centred at the top of the sheet, drawn to a fixed height whatever its shape. */
function drawCrown(doc: jsPDF, orn: Ornament, asset: AssetFn, alias: string): void {
  const h = CROWN.h;
  const w = h * orn.aspect;
  doc.addImage(asset(orn.url), 'PNG', PAGE.w / 2 - w / 2, CROWN.top, w, h, alias, 'FAST');
}

/** The small motif, centred near the foot of the sheet. */
function drawFooterMotif(doc: jsPDF, orn: Ornament, asset: AssetFn, alias: string): void {
  const h = FOOTER.h;
  const w = h * orn.aspect;
  doc.addImage(
    asset(orn.url), 'PNG',
    PAGE.w / 2 - w / 2, FOOTER.bottom - h, w, h, alias, 'FAST',
  );
}

/* ── the cover ─────────────────────────────────────────────────────────── */

function drawCover(
  doc: jsPDF,
  lang: Lang,
  draft: PackageDraft,
  counts: Record<WalletKindId, number>,
  kindIds: WalletKindId[],
  issuedOn: Date,
  asset: AssetFn,
): void {
  drawCrown(doc, COVER_ORNAMENT.crown, asset, 'crown-cover');
  drawFooterMotif(doc, COVER_ORNAMENT.footer, asset, 'foot-cover');

  // The cover mandala is drawn around an empty circle; the emblem goes in it,
  // sized to fill that circle rather than float in it.
  const markH = CROWN.h * 0.22;
  const markW = markH * MARK_ASPECT;
  doc.addImage(
    asset(MARK_URL), 'PNG',
    PAGE.w / 2 - markW / 2, CROWN.top + CROWN.h / 2 - markH / 2, markW, markH,
    'mark', 'FAST',
  );

  const ctx: Ctx = { doc, box: CONTENT_BOX };

  text(ctx, 'cover title', t(STR.pdfCoverTitle, lang), C.cx, 98, 'center', GARAMOND, 'bold', 28);
  rule(ctx, 'cover rule A', C.railL, C.railR, 106, 0.4);

  text(ctx, 'cover owner label', t(STR.pdfCoverOwner, lang), C.cx, 116, 'center', GARAMOND, 'normal', 11);
  const owner = fitOneLine(doc, draft.fullName || '', GARAMOND, 'bold', 22, C.w, 14);
  text(ctx, 'cover owner', owner.text, C.cx, 128, 'center', GARAMOND, 'bold', owner.size);

  // An empty description draws nothing and moves nothing below it.
  const desc = twoLines(doc, draft.description, GARAMOND, 'normal', 13, 11, C.w);
  if (desc.lines[0]) text(ctx, 'cover description L1', desc.lines[0], C.cx, 139, 'center', GARAMOND, 'normal', desc.size);
  if (desc.lines[1]) text(ctx, 'cover description L2', desc.lines[1], C.cx, 145.5, 'center', GARAMOND, 'normal', desc.size);

  rule(ctx, 'cover rule B', C.railL, C.railR, 154, 0.15);
  text(ctx, 'cover contents label', t(STR.pdfCoverContents, lang), C.cx, 163, 'center', GARAMOND, 'normal', 11);

  // Four slots, always 9.0 mm apart; unused slots are simply not drawn.
  kindIds.slice(0, 4).forEach((id, i) => {
    const kind = walletKind(id);
    const y = 174 + i * 9;
    const label = fitOneLine(doc, t(kind.name, lang), GARAMOND, 'normal', 14, C.railW - 20, 10);
    text(ctx, `cover contents ${id}`, label.text, C.railL, y, 'left', GARAMOND, 'normal', label.size);
    text(ctx, `cover count ${id}`, TIMES + counts[id], C.railR, y, 'right', GARAMOND, 'normal', 14);
  });

  rule(ctx, 'cover rule C', C.railL, C.railR, 214, 0.15);
  text(ctx, 'cover issued label', t(STR.pdfCoverIssued, lang), C.cx, 223, 'center', GARAMOND, 'normal', 11);
  text(ctx, 'cover issued date', isoDate(issuedOn), C.cx, 232, 'center', MONO, 'normal', 13);

  const safety = twoLines(doc, t(STR.keySafety, lang), GARAMOND, 'normal', 10, 9, C.w);
  if (safety.lines[0]) text(ctx, 'cover safety L1', safety.lines[0], C.cx, 245, 'center', GARAMOND, 'normal', safety.size);
  if (safety.lines[1]) text(ctx, 'cover safety L2', safety.lines[1], C.cx, 250, 'center', GARAMOND, 'normal', safety.size);
  text(ctx, 'cover footer', t(STR.pdfFooter, lang), C.cx, 257, 'center', GARAMOND, 'normal', 9);
}

/* ── a wallet page ─────────────────────────────────────────────────────── */

async function drawWalletPage(
  doc: jsPDF,
  lang: Lang,
  draft: PackageDraft,
  entry: WalletEntry,
  countOfKind: number,
  pageNumber: number,
  totalPages: number,
  asset: AssetFn,
): Promise<void> {
  const kind = walletKind(entry.kind);
  drawCrown(doc, kind.crown, asset, `crown-${kind.id}`);
  drawFooterMotif(doc, kind.footer, asset, `foot-${kind.id}`);

  const ctx: Ctx = { doc, box: CONTENT_BOX };

  // ── who and what ────────────────────────────────────────────────────
  const name = fitOneLine(doc, t(kind.name, lang), GARAMOND, 'bold', 26, A.x1 - A.x0, 16);
  text(ctx, 'kind name', name.text, A.cx, 92, 'center', GARAMOND, 'bold', name.size);
  const tagline = fitOneLine(doc, t(kind.tagline, lang), GARAMOND, 'normal', 12, A.x1 - A.x0, 9);
  text(ctx, 'tagline', tagline.text, A.cx, 100, 'center', GARAMOND, 'normal', tagline.size);

  // A set is numbered so the sheets can be told apart and kept in order.
  if (kind.numbered && countOfKind > 1) {
    text(
      ctx, 'position',
      t(STR.pdfPositionOf(entry.position, countOfKind), lang),
      A.cx, 108, 'center', MONO, 'normal', 14,
    );
  }

  const owner = fitOneLine(doc, draft.fullName || '', GARAMOND, 'bold', 18, A.x1 - A.x0, 12);
  text(ctx, 'owner', owner.text, A.cx, 119, 'center', GARAMOND, 'bold', owner.size);

  const desc = twoLines(doc, draft.description, GARAMOND, 'normal', 12, 10, A.x1 - A.x0);
  if (desc.lines[0]) text(ctx, 'description L1', desc.lines[0], A.cx, 128, 'center', GARAMOND, 'normal', desc.size);
  if (desc.lines[1]) text(ctx, 'description L2', desc.lines[1], A.cx, 134, 'center', GARAMOND, 'normal', desc.size);

  // ── the two codes ───────────────────────────────────────────────────
  // Told apart without colour: the address is on the LEFT, under an OUTLINED
  // bar, with a SMALLER code; the private key is on the RIGHT, under a SOLID
  // BLACK bar with reversed type, and its code is bigger. A solid black tab
  // survives a photocopier, a dying cartridge and every kind of colour blindness.
  const BAR_Y = 140, BAR_H = 10;
  doc.setLineWidth(0.3);
  assertInside('address bar', ctx.box, A.leftX0, BAR_Y, A.colW, BAR_H);
  doc.rect(A.leftX0, BAR_Y, A.colW, BAR_H, 'S');
  text(ctx, 'address caption', t(STR.pdfWalletAddress, lang), A.leftCx, BAR_Y + 7, 'center', GARAMOND, 'bold', 13);

  assertInside('key bar', ctx.box, A.rightX0, BAR_Y, A.colW, BAR_H);
  doc.rect(A.rightX0, BAR_Y, A.colW, BAR_H, 'F');
  doc.setTextColor(255, 255, 255);
  text(ctx, 'key caption', t(STR.pdfPrivateKey, lang), A.rightCx, BAR_Y + 7, 'center', GARAMOND, 'bold', 13);
  doc.setTextColor(0);

  text(ctx, 'scan to receive', t(STR.pdfScanToReceive, lang), A.leftCx, 157, 'center', GARAMOND, 'normal', 9.5);
  text(ctx, 'scan to spend', t(STR.pdfScanToSpend, lang), A.rightCx, 157, 'center', GARAMOND, 'normal', 9.5);

  // The address can be re-derived from the key, so it can afford level M; the
  // key cannot be recovered from anything, so it gets Q's 25 % damage tolerance.
  const address = entry.address ?? '';
  const wif = entry.wif ?? '';
  const [addressQr, keyQr] = await Promise.all([qr(address, 'M'), qr(wif, 'Q')]);

  // The key's code is the bigger of the two, and its block of type sits lower
  // because of it. The numbers are chosen so the lower block still clears the
  // safety line: 161 + 70 + 15.5 = 246.5, against a baseline at 252.
  const ADDR_QR = 58, KEY_QR = 70, QR_TOP = 161;
  image(ctx, 'address QR', addressQr, A.leftCx - ADDR_QR / 2, QR_TOP, ADDR_QR, ADDR_QR, `qr-a-${entry.uid}`);
  image(ctx, 'key QR', keyQr, A.rightCx - KEY_QR / 2, QR_TOP, KEY_QR, KEY_QR, `qr-k-${entry.uid}`);

  // Broken once, at a fixed character offset so the break sits in the same place
  // on every sheet in a stack.
  const [a1, a2] = splitAt(address, 17);
  text(ctx, 'address line 1', a1, A.leftCx, QR_TOP + ADDR_QR + 9, 'center', MONO, 'normal', 12);
  text(ctx, 'address line 2', a2, A.leftCx, QR_TOP + ADDR_QR + 15.5, 'center', MONO, 'normal', 12);

  const [k1, k2] = splitAt(wif, 26);
  text(ctx, 'wif line 1', k1, A.rightCx, QR_TOP + KEY_QR + 9, 'center', MONO, 'normal', 12);
  text(ctx, 'wif line 2', k2, A.rightCx, QR_TOP + KEY_QR + 15.5, 'center', MONO, 'normal', 12);

  // ── the small print ─────────────────────────────────────────────────
  const safety = fitOneLine(doc, t(STR.keySafety, lang), GARAMOND, 'normal', 9.5, A.x1 - A.x0, 7);
  text(ctx, 'safety', safety.text, A.cx, 252, 'center', GARAMOND, 'normal', safety.size);
  text(ctx, 'footer', t(STR.pdfFooter, lang), A.x0, 256.5, 'left', GARAMOND, 'normal', 9);
  text(
    ctx, 'page of',
    t(STR.pdfPageOf(pageNumber, totalPages), lang),
    A.x1, 256.5, 'right', GARAMOND, 'normal', 9,
  );
}
