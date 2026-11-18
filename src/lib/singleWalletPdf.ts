import jsPDF from 'jspdf';
import { P, STR, t } from './packageStrings';
import type { Lang, Phrase } from './packageStrings';
import { walletKind } from './walletKinds';
import type { WalletKindId } from './walletKinds';
import { GARAMOND, MONO, registerPdfFonts } from './pdfFonts';
import {
  drawCrown,
  drawFooterMotif,
  drawWalletPage,
  fitOneLine,
  loadAsset,
  qr,
  splitAt,
} from './packagePdf';

/**
 * The print templates of the single-wallet page (the one you reach by entering
 * or scanning one key on the front page).
 *
 *  classic  – the original HTML print: 2 cards, or 6 with the Nostr data.
 *             Built in Results.tsx, not here.
 *  mandala  – the engraved sheet of the Complete Package. With the Nostr data
 *             chosen, a second engraved sheet carries the two Nostr HEX codes.
 *  a4 / a5  – the wallet only (address + private key), no ornament, and what
 *             the wallet is for written large across the top.
 */
export type PrintTemplate = 'classic' | 'mandala' | 'a4' | 'a5';

export const TEMPLATE_STR = {
  heading: P('Predloga za tisk', 'Print template', 'Nyomtatási sablon'),
  classic: P('Klasična', 'Classic', 'Klasszikus'),
  classicDesc: P(
    'Dosedanji izpis: kartice s kodami na enem listu.',
    'The original printout: cards with codes on one sheet.',
    'Az eredeti nyomtatás: kártyák kódokkal egy lapon.',
  ),
  mandala: P('Mandala', 'Mandala', 'Mandala'),
  mandalaDesc: P(
    'Graviran list z mandalo, kot v Popolnem paketu.',
    'An engraved sheet with a mandala, as in the Complete Package.',
    'Gravírozott lap mandalával, mint a Teljes csomagban.',
  ),
  a4: P('A4 – samo denarnica', 'A4 – wallet only', 'A4 – csak a tárca'),
  a4Desc: P(
    'Naslov in ključ, zgoraj z velikimi črkami, čemu denarnica služi.',
    'Address and key, with what the wallet is for in large type above.',
    'Cím és kulcs, felül nagy betűkkel, mire szolgál a tárca.',
  ),
  a5: P('A5 – samo denarnica', 'A5 – wallet only', 'A5 – csak a tárca'),
  a5Desc: P(
    'Enako kot A4, na pol manjšem listu.',
    'The same as A4, on a half-size sheet.',
    'Ugyanaz, mint az A4, fele akkora lapon.',
  ),
  kindLabel: P('Vrsta denarnice', 'Wallet type', 'Tárca típusa'),
  purposeLabel: P(
    'Čemu služi ta denarnica (velik napis)',
    'What this wallet is for (large type)',
    'Mire szolgál ez a tárca (nagy betűkkel)',
  ),
  purposePlaceholder: P(
    'npr. Varčevanje za hišo',
    'e.g. Savings for the house',
    'pl. Megtakarítás a házra',
  ),
  purposeHint: P(
    'Če pustiš prazno, se izpiše opis vrste denarnice.',
    'Left empty, the description of the wallet type is printed.',
    'Üresen hagyva a tárcatípus leírása kerül rá.',
  ),
  descriptionLabel: P('Opis pod imenom (neobvezno)', 'Description under the name (optional)', 'Leírás a név alatt (nem kötelező)'),
  walletOnlyNote: P(
    'Ta predloga vsebuje samo naslov in zasebni ključ denarnice — Nostr podatkov ni na njej.',
    'This template carries only the wallet address and private key — the Nostr data is not on it.',
    'Ez a sablon csak a tárca címét és privát kulcsát tartalmazza — a Nostr adatok nincsenek rajta.',
  ),
  mandalaNostrNote: P(
    'Nostr HEX ID in Nostr zasebni ključ (HEX) sta na drugem listu.',
    'The Nostr HEX ID and the Nostr private key (HEX) are on a second sheet.',
    'A Nostr HEX ID és a Nostr privát kulcs (HEX) egy második lapon van.',
  ),
  download: P('Prenesi PDF', 'Download PDF', 'PDF letöltése'),
  building: P('Pripravljam PDF …', 'Preparing the PDF …', 'PDF készítése …'),
  failed: P(
    'PDF-ja ni bilo mogoče pripraviti. Poskusi znova.',
    'The PDF could not be prepared. Please try again.',
    'A PDF-et nem sikerült elkészíteni. Próbálja újra.',
  ),
  nostrTitle: P('Nostr identiteta', 'Nostr identity', 'Nostr identitás'),
  nostrHexId: P('Nostr HEX ID', 'Nostr HEX ID', 'Nostr HEX ID'),
  nostrPrivHex: P('Nostr zasebni ključ', 'Nostr private key', 'Nostr privát kulcs'),
  nostrScanId: P('Skeniraj za identiteto', 'Scan for the identity', 'Olvassa be az identitáshoz'),
  nostrScanKey: P('Skeniraj za prijavo', 'Scan to sign in', 'Olvassa be a belépéshez'),
} satisfies Record<string, Phrase>;

export interface SingleWalletPdfInput {
  template: Exclude<PrintTemplate, 'classic'>;
  lang: Lang;
  kind: WalletKindId;
  wif: string;
  address: string;
  /** A4/A5: the large "what it is for" text. Mandala: the description line. */
  purpose: string;
  /** Mandala only: printed on a second sheet when present. */
  nostr?: { hexId: string; privateKeyHex: string };
}

export function singleWalletFileName(template: PrintTemplate): string {
  return `lana-wallet-${template}.pdf`;
}

export async function buildSingleWalletPdf(input: SingleWalletPdfInput): Promise<Blob> {
  const format = input.template === 'a5' ? 'a5' : 'a4';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format, compress: true });
  await registerPdfFonts(doc);
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setFillColor(0, 0, 0);

  if (input.template === 'mandala') {
    await drawMandala(doc, input);
  } else {
    await drawWalletOnly(doc, input, input.template === 'a5' ? 148 / 210 : 1);
  }
  return doc.output('blob');
}

/* ── mandala ───────────────────────────────────────────────────────────── */

async function drawMandala(doc: jsPDF, input: SingleWalletPdfInput): Promise<void> {
  const kind = walletKind(input.kind);
  const loaded = new Map<string, string>();
  await Promise.all(
    [kind.crown.url, kind.footer.url].map(async (url) => loaded.set(url, await loadAsset(url))),
  );
  const asset = (url: string): string => {
    const data = loaded.get(url);
    if (!data) throw new Error(`asset not loaded: ${url}`);
    return data;
  };

  // The very page the Complete Package prints for this kind of wallet.
  await drawWalletPage(
    doc,
    input.lang,
    { fullName: '', description: input.purpose, docLang: input.lang, counts: {} },
    {
      uid: 'single',
      kind: input.kind,
      position: 1,
      input: input.wif,
      wif: input.wif,
      address: input.address,
      keyId: null,
      error: null,
    },
    1,
    asset,
  );

  if (!input.nostr) return;

  // The Nostr identity on a sheet of its own, in the same engraving and the same
  // two-column code: the public HEX ID on the left under an outlined bar, the
  // private key on the right under a solid one. HEX only — never npub/nsec.
  doc.addPage('a4', 'portrait');
  drawCrown(doc, kind.crown, asset, `crown-${kind.id}`);
  drawFooterMotif(doc, kind.footer, asset, `foot-${kind.id}`);

  const lang = input.lang;
  const W = 166;
  const title = fitOneLine(doc, t(TEMPLATE_STR.nostrTitle, lang), GARAMOND, 'bold', 26, W, 16);
  text(doc, title.text, 105, 100, GARAMOND, 'bold', title.size);
  const sub = fitOneLine(doc, t(kind.name, lang), GARAMOND, 'normal', 12, W, 9);
  text(doc, sub.text, 105, 108, GARAMOND, 'normal', sub.size);

  const cols = { leftX0: 22, leftCx: 60, rightX0: 112, rightCx: 150, colW: 76 };
  await drawCodePair(doc, lang, {
    x: (v) => v,
    pt: (v) => v,
    ...cols,
    barY: 140,
    hintY: 157,
    qrTop: 161,
    leftQr: 58,
    rightQr: 70,
    left: { caption: TEMPLATE_STR.nostrHexId, hint: TEMPLATE_STR.nostrScanId, value: input.nostr.hexId, level: 'M', split: 32, mono: 9.5 },
    right: { caption: TEMPLATE_STR.nostrPrivHex, hint: TEMPLATE_STR.nostrScanKey, value: input.nostr.privateKeyHex, level: 'Q', split: 32, mono: 9.5 },
    alias: 'nostr',
  });

  // A little lower than on the wallet sheet: two lines of HEX sit under the
  // larger code and need the room.
  const safety = fitOneLine(doc, t(STR.keySafety, lang), GARAMOND, 'normal', 9.5, W, 7);
  text(doc, safety.text, 105, 257, GARAMOND, 'normal', safety.size);
}

/* ── A4 / A5: the wallet only, its purpose in large type ──────────────── */

/**
 * Laid out once in A4 millimetres; A5 is the same sheet scaled by 148/210, so
 * both keep exactly the same proportions.
 */
async function drawWalletOnly(doc: jsPDF, input: SingleWalletPdfInput, k: number): Promise<void> {
  const lang = input.lang;
  const kind = walletKind(input.kind);
  const m = (v: number) => v * k;
  const cx = m(105);
  const W = m(170);

  // ── what kind of wallet ────────────────────────────────────────────
  const name = fitOneLine(doc, t(kind.name, lang), GARAMOND, 'bold', 22 * k, W, 12 * k);
  text(doc, name.text, cx, m(28), GARAMOND, 'bold', name.size);

  const own = input.purpose.trim();
  // With no purpose written, the kind's own tagline becomes the large text, and
  // is not repeated small above it.
  const big = own || t(kind.tagline, lang);
  if (own) {
    const tagline = fitOneLine(doc, t(kind.tagline, lang), GARAMOND, 'normal', 12 * k, W, 8 * k);
    text(doc, tagline.text, cx, m(37), GARAMOND, 'normal', tagline.size);
  }
  doc.setLineWidth(0.4 * k);
  doc.line(m(40), m(45), m(170), m(45));

  // ── what it is for, as large as fits ───────────────────────────────
  // Up to four lines between the rule and the codes; the size steps down until
  // the whole text fits, and only at the floor is the last line cut.
  const BOX_TOP = m(50), BOX_BOTTOM = m(138);
  let size = 34 * k;
  const floor = 16 * k;
  const PT = 0.352778;
  let lines: string[] = [];
  for (;;) {
    doc.setFont(GARAMOND, 'bold');
    doc.setFontSize(size);
    lines = doc.splitTextToSize(big, W) as string[];
    const height = lines.length * size * PT * 1.22;
    if ((lines.length <= 4 && height <= BOX_BOTTOM - BOX_TOP) || size <= floor) break;
    size = Math.max(floor, size - 1 * k);
  }
  if (lines.length > 4) {
    lines = lines.slice(0, 4);
    let last = lines[3];
    while (last.length > 1 && doc.getTextWidth(last + '…') > W) last = last.slice(0, -1);
    lines[3] = last + '…';
  }
  const lh = size * PT * 1.22;
  const blockH = lines.length * lh;
  // Centred in the box: the first baseline sits one cap height below the top of
  // the block.
  let y = BOX_TOP + (BOX_BOTTOM - BOX_TOP - blockH) / 2 + size * PT * 0.9;
  for (const line of lines) {
    text(doc, line, cx, y, GARAMOND, 'bold', size);
    y += lh;
  }

  // ── the two codes ──────────────────────────────────────────────────
  await drawCodePair(doc, lang, {
    x: m,
    pt: (v) => v * k,
    leftX0: m(20),
    leftCx: m(59),
    rightX0: m(112),
    rightCx: m(151),
    colW: m(78),
    barY: m(146),
    hintY: m(163),
    qrTop: m(167),
    leftQr: m(58),
    rightQr: m(70),
    left: { caption: STR.pdfWalletAddress, hint: STR.pdfScanToReceive, value: input.address, level: 'M', split: 17, mono: 12 },
    right: { caption: STR.pdfPrivateKey, hint: STR.pdfScanToSpend, value: input.wif, level: 'Q', split: 26, mono: 12 },
    alias: 'wallet',
  });

  const safety = fitOneLine(doc, t(STR.keySafety, lang), GARAMOND, 'normal', 10 * k, W, 7 * k);
  text(doc, safety.text, cx, m(268), GARAMOND, 'normal', safety.size);
}

/* ── shared pieces ─────────────────────────────────────────────────────── */

interface CodeSide {
  caption: Phrase;
  hint: Phrase;
  value: string;
  level: 'M' | 'Q';
  /** Characters on the first line; the rest go on the second. */
  split: number;
  /** Size of the printed string, in A4 points. */
  mono: number;
}

interface CodePairLayout {
  x: (mm: number) => number;
  pt: (size: number) => number;
  leftX0: number;
  leftCx: number;
  rightX0: number;
  rightCx: number;
  colW: number;
  barY: number;
  hintY: number;
  qrTop: number;
  leftQr: number;
  rightQr: number;
  left: CodeSide;
  right: CodeSide;
  alias: string;
}

/**
 * The public code on the LEFT under an OUTLINED bar with the smaller code; the
 * secret on the RIGHT under a SOLID BLACK bar with reversed type and the bigger
 * code — told apart without colour, as on every sheet this site prints.
 */
async function drawCodePair(doc: jsPDF, lang: Lang, L: CodePairLayout): Promise<void> {
  const barH = L.x(10);
  doc.setLineWidth(L.x(0.3));
  doc.rect(L.leftX0, L.barY, L.colW, barH, 'S');
  const lc = fitOneLine(doc, t(L.left.caption, lang), GARAMOND, 'bold', L.pt(13), L.colW - L.x(6), L.pt(8));
  text(doc, lc.text, L.leftCx, L.barY + L.x(7), GARAMOND, 'bold', lc.size);

  doc.rect(L.rightX0, L.barY, L.colW, barH, 'F');
  const rc = fitOneLine(doc, t(L.right.caption, lang), GARAMOND, 'bold', L.pt(13), L.colW - L.x(6), L.pt(8));
  doc.setTextColor(255, 255, 255);
  text(doc, rc.text, L.rightCx, L.barY + L.x(7), GARAMOND, 'bold', rc.size);
  doc.setTextColor(0);

  const lh = fitOneLine(doc, t(L.left.hint, lang), GARAMOND, 'normal', L.pt(9.5), L.colW, L.pt(7));
  text(doc, lh.text, L.leftCx, L.hintY, GARAMOND, 'normal', lh.size);
  const rh = fitOneLine(doc, t(L.right.hint, lang), GARAMOND, 'normal', L.pt(9.5), L.colW, L.pt(7));
  text(doc, rh.text, L.rightCx, L.hintY, GARAMOND, 'normal', rh.size);

  const [leftQr, rightQr] = await Promise.all([qr(L.left.value, L.left.level), qr(L.right.value, L.right.level)]);
  doc.addImage(leftQr, 'PNG', L.leftCx - L.leftQr / 2, L.qrTop, L.leftQr, L.leftQr, `qr-l-${L.alias}`, 'FAST');
  doc.addImage(rightQr, 'PNG', L.rightCx - L.rightQr / 2, L.qrTop, L.rightQr, L.rightQr, `qr-r-${L.alias}`, 'FAST');

  const [l1, l2] = splitAt(L.left.value, L.left.split);
  text(doc, l1, L.leftCx, L.qrTop + L.leftQr + L.x(9), MONO, 'normal', L.pt(L.left.mono));
  text(doc, l2, L.leftCx, L.qrTop + L.leftQr + L.x(15.5), MONO, 'normal', L.pt(L.left.mono));
  const [r1, r2] = splitAt(L.right.value, L.right.split);
  text(doc, r1, L.rightCx, L.qrTop + L.rightQr + L.x(9), MONO, 'normal', L.pt(L.right.mono));
  text(doc, r2, L.rightCx, L.qrTop + L.rightQr + L.x(15.5), MONO, 'normal', L.pt(L.right.mono));
}

function text(
  doc: jsPDF,
  content: string,
  x: number,
  y: number,
  family: string,
  style: 'normal' | 'bold',
  size: number,
): void {
  if (!content) return;
  doc.setFont(family, style);
  doc.setFontSize(size);
  doc.text(content, x, y, { align: 'center' });
}
