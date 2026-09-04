/**
 * Every user-facing string lives here, in both languages at once.
 *
 * The screen shows one language; the printed package shows both, Slovenian
 * leading and English underneath. That is why strings are kept as pairs
 * everywhere instead of being resolved at lookup time — the PDF needs the pair.
 */

export type Lang = 'sl' | 'en';

export interface Bilingual {
  sl: string;
  en: string;
}

export const B = (sl: string, en: string): Bilingual => ({ sl, en });

export const t = (s: Bilingual, lang: Lang): string => s[lang];

/**
 * Slovenian counts four ways — one wallet, two wallets, three or four wallets,
 * and five or more. English gets by with two, so a shared `n === 1` test quietly
 * produces "Manjka še 3 ključev", which no Slovene would write.
 */
export function sl(n: number, one: string, two: string, few: string, many: string): string {
  const r = n % 100;
  if (r === 1) return one;
  if (r === 2) return two;
  if (r === 3 || r === 4) return few;
  return many;
}

const en = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * The bridge from the app's language to this feature's.
 *
 * The rest of lanapaper.online speaks three languages ('en' | 'sl' | 'hu');
 * the package speaks two, because the printed sheet is set in Slovenian over
 * English and that is a decision about paper, not about the interface.
 *
 * So: 'sl' stays Slovenian, and EVERYTHING ELSE — Hungarian included — is
 * given the English wording. That is a real gap, not a rounding: a Hungarian
 * visitor reads this whole feature in English because it has no Hungarian
 * strings yet. Writing that down here is the only reason anyone will remember
 * to finish it; add 'hu' to Lang and to every entry of STR when the time comes.
 */
export function packageLang(appLanguage: string): Lang {
  return appLanguage === 'sl' ? 'sl' : 'en';
}

export const STR = {
  // ── Wizard chrome ──────────────────────────────────────────────────────
  /** The name of the feature, in the header of /package. */
  packageCardTitle: B('Popoln paket', 'Complete package'),
  stepOf: (n: number, total: number) => B(`Korak ${n} od ${total}`, `Step ${n} of ${total}`),
  step1Name: B('Kdo in kaj', 'Who and what'),
  step2Name: B('Ključi', 'Keys'),
  step3Name: B('Dokument', 'Document'),
  back: B('Nazaj', 'Back'),
  next: B('Naprej', 'Continue'),
  startOver: B('Začni znova', 'Start over'),
  backToStart: B('Nazaj na začetek', 'Back to the start'),
  discardConfirm: B(
    'Vse, kar si vpisal, bo izgubljeno. Res nazaj na začetek?',
    'Everything you have entered will be lost. Go back to the start anyway?',
  ),

  // ── Step 1 — who and what ──────────────────────────────────────────────
  step1Heading: B('Sestavi svoj paket', 'Compose your package'),
  step1Intro: B(
    'Vpiši, komu paket pripada, in izberi, katere denarnice naj bodo v njem.',
    'Say who the package belongs to, then choose which wallets belong in it.',
  ),
  fullNameLabel: B('Ime in priimek', 'Full name'),
  fullNamePlaceholder: B('Janez Novak', 'Jane Doe'),
  fullNameMissing: B('Vpiši ime in priimek.', 'Enter a full name.'),
  descriptionLabel: B('Opis', 'Description'),
  descriptionOptional: B('neobvezno', 'optional'),
  descriptionPlaceholder: B(
    'npr. Družinski prihranki 2026',
    'e.g. Family savings 2026',
  ),
  descriptionHint: B(
    'Kar vpišeš sem, bo natisnjeno na vsaki denarnici v paketu.',
    'Whatever you write here is printed on every wallet in the package.',
  ),

  chooseWallets: B('Katere denarnice želiš v paketu?', 'Which wallets do you want in the package?'),
  chooseWalletsHint: B(
    'Glavno denarnico lahko izbereš samo eno. Lana8Wonder pride vedno kot komplet osmih.',
    'You can hold only one Main Wallet. Lana8Wonder always comes as a set of eight.',
  ),
  included: B('V paketu', 'In the package'),
  notIncluded: B('Ni v paketu', 'Not in the package'),
  add: B('Dodaj', 'Add'),
  remove: B('Odstrani', 'Remove'),
  addOne: B('Dodaj eno', 'Add one'),
  removeOne: B('Odstrani eno', 'Remove one'),
  countLabel: B('Število', 'Count'),
  fixedSet: B('komplet 8 denarnic', 'set of 8 wallets'),
  onlyOne: B('samo ena', 'only one'),
  severalAllowed: B('lahko jih je več', 'several allowed'),

  packageEmpty: B(
    'Izberi vsaj eno denarnico.',
    'Choose at least one wallet.',
  ),
  packageTooBig: (max: number) =>
    B(
      `V en paket gre največ ${max} ${sl(max, 'denarnica', 'denarnici', 'denarnice', 'denarnic')}.`,
      `A single package holds at most ${max} ${en(max, 'wallet', 'wallets')}.`,
    ),
  walletsInPackage: (n: number) =>
    B(
      `${n} ${sl(n, 'denarnica', 'denarnici', 'denarnice', 'denarnic')} v paketu`,
      `${n} ${en(n, 'wallet', 'wallets')} in the package`,
    ),

  // ── Step 2 — keys ──────────────────────────────────────────────────────
  step2Heading: B('Vnesi zasebne ključe', 'Enter the private keys'),
  step2Intro: B(
    'Za vsako denarnico prilepi ali skeniraj njen zasebni ključ (WIF). Naslov denarnice se izračuna sam, tukaj v tvojem brskalniku.',
    'For every wallet, paste or scan its private key (WIF). The wallet address is worked out for you, right here in your browser.',
  ),
  keyLabel: B('Zasebni ključ (WIF)', 'Private key (WIF)'),
  keyPlaceholder: B('T…', 'T…'),
  scan: B('Skeniraj', 'Scan'),
  addressLabel: B('Naslov denarnice', 'Wallet address'),
  progressFilled: (done: number, total: number) =>
    B(`Izpolnjenih ${done} od ${total}`, `${done} of ${total} filled in`),
  allFilled: B('Vse denarnice so izpolnjene.', 'Every wallet is filled in.'),
  stillMissing: (n: number) =>
    B(
      `${sl(n, 'Manjka', 'Manjkata', 'Manjkajo', 'Manjka')} še ${n} ${sl(n, 'ključ', 'ključa', 'ključi', 'ključev')}.`,
      `${n} ${en(n, 'key', 'keys')} still missing.`,
    ),

  errNotAKey: B(
    'To ni videti kot zasebni ključ LanaCoin.',
    'That does not look like a LanaCoin private key.',
  ),
  errWrongNetwork: B(
    'Ta ključ ni z omrežja LanaCoin.',
    'This key is not from the LanaCoin network.',
  ),
  errChecksum: B(
    'Ključ je nepopoln ali napačno prepisan.',
    'The key is incomplete or mistyped.',
  ),
  errNoCrypto: B(
    'Brskalnik tukaj ne da dostopa do šifriranja. Odpri stran prek https:// ali na tej napravi.',
    'The browser withholds cryptography here. Open the page over https:// or on this device.',
  ),
  errDuplicate: B(
    'Ta ključ si v paketu že uporabil.',
    'You have already used this key in the package.',
  ),

  // ── Step 3 — the document ──────────────────────────────────────────────
  step3Heading: B('Paket je pripravljen', 'The package is ready'),
  step3Intro: B(
    'Preglej povzetek in prenesi dokument. Nastane v tvojem brskalniku — nič ne gre na noben strežnik.',
    'Check the summary and download the document. It is made in your browser — nothing goes to any server.',
  ),
  downloadPdf: B('Prenesi PDF', 'Download PDF'),
  buildingPdf: B('Sestavljam dokument…', 'Building the document…'),
  pdfPages: (n: number) =>
    B(`${n} ${sl(n, 'stran', 'strani', 'strani', 'strani')}`, `${n} ${en(n, 'page', 'pages')}`),
  pdfFailed: B('Dokumenta ni bilo mogoče sestaviti.', 'The document could not be built.'),
  printHint: B(
    'Tiskaj na A4, brez prilagajanja velikosti (100 %), po možnosti na debelejši papir.',
    'Print on A4 at 100 % scale, with no shrink-to-fit, ideally on heavier paper.',
  ),

  // ── Safety ─────────────────────────────────────────────────────────────
  localOnly: B(
    'Vse se zgodi v tvojem brskalniku. Noben ključ ne zapusti te naprave.',
    'Everything happens in your browser. No key ever leaves this device.',
  ),
  keySafety: B(
    'Kdor ima zasebni ključ, ima denar. Ta dokument hrani tako, kot bi hranil gotovino.',
    'Whoever holds the private key holds the money. Keep this document as you would keep cash.',
  ),

  // ── Printed document ───────────────────────────────────────────────────
  pdfCoverTitle: B('Papirnate denarnice', 'Paper Wallets'),
  pdfCoverOwner: B('Paket pripada', 'This package belongs to'),
  pdfCoverContents: B('Vsebina paketa', 'Contents of the package'),
  pdfCoverIssued: B('Izdano', 'Issued'),
  pdfWalletAddress: B('Naslov denarnice', 'Wallet address'),
  pdfPrivateKey: B('Zasebni ključ', 'Private key'),
  pdfScanToReceive: B('Skeniraj za prejem', 'Scan to receive'),
  pdfScanToSpend: B('Skeniraj za razpolaganje', 'Scan to spend'),
  pdfPositionOf: (n: number, total: number) =>
    B(`${n} od ${total}`, `${n} of ${total}`),
  pdfPageOf: (n: number, total: number) =>
    B(`Stran ${n} od ${total}`, `Page ${n} of ${total}`),
  pdfFooter: B('lanapaper.online', 'lanapaper.online'),

  // ── On lanapaper.online's own landing page ─────────────────────────────
  packageBack: B('Nazaj na lanapaper.online', 'Back to lanapaper.online'),
} as const;
