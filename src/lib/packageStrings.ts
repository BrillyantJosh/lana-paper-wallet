/**
 * Every user-facing string of the Complete Package, in all three languages the
 * site speaks.
 *
 * Two languages are chosen independently. The SCREEN follows the app's own
 * language switch. The printed DOCUMENT follows a choice made on step 1, because
 * the person filling the form and the person the package is for are often not
 * the same — a Slovenian grandmother making a set for a Hungarian grandchild.
 * That is why a string is kept as a phrase in every language rather than being
 * resolved at lookup time.
 */

export type Lang = 'sl' | 'en' | 'hu';

export interface Phrase {
  sl: string;
  en: string;
  hu: string;
}

export const P = (sl: string, en: string, hu: string): Phrase => ({ sl, en, hu });

export const t = (s: Phrase, lang: Lang): string => s[lang];

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'sl', label: 'Slovenščina' },
  { id: 'en', label: 'English' },
  { id: 'hu', label: 'Magyar' },
];

/**
 * Slovenian counts four ways — one wallet, two wallets, three or four wallets,
 * and five or more. English gets by with two, so a shared `n === 1` test quietly
 * produces "Manjka še 3 ključev", which no Slovene would write.
 *
 * Hungarian needs none of this: a noun after a numeral stays singular, so
 * "3 tárca" is already correct.
 */
export function sl(n: number, one: string, two: string, few: string, many: string): string {
  const r = n % 100;
  if (r === 1) return one;
  if (r === 2) return two;
  if (r === 3 || r === 4) return few;
  return many;
}

const en = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** The app's language is already one of ours; anything unexpected reads English. */
export function packageLang(appLanguage: string): Lang {
  return appLanguage === 'sl' || appLanguage === 'hu' || appLanguage === 'en'
    ? (appLanguage as Lang)
    : 'en';
}

export const STR = {
  // ── Wizard chrome ──────────────────────────────────────────────────────
  /** The name of the feature, in the header of /package. */
  packageCardTitle: P('Popoln paket', 'Complete package', 'Teljes csomag'),
  stepOf: (n: number, total: number) =>
    P(`Korak ${n} od ${total}`, `Step ${n} of ${total}`, `${n}. lépés / ${total}`),
  step1Name: P('Kdo in kaj', 'Who and what', 'Ki és mi'),
  step2Name: P('Ključi', 'Keys', 'Kulcsok'),
  step3Name: P('Dokument', 'Document', 'Dokumentum'),
  back: P('Nazaj', 'Back', 'Vissza'),
  next: P('Naprej', 'Continue', 'Tovább'),
  startOver: P('Začni znova', 'Start over', 'Újrakezdés'),
  backToStart: P('Nazaj na začetek', 'Back to the start', 'Vissza az elejére'),
  discardConfirm: P(
    'Vse, kar si vpisal, bo izgubljeno. Res nazaj na začetek?',
    'Everything you have entered will be lost. Go back to the start anyway?',
    'Minden megadott adat elvész. Biztosan visszatér az elejére?',
  ),

  // ── Step 1 — who and what ──────────────────────────────────────────────
  step1Heading: P('Sestavi svoj paket', 'Compose your package', 'Állítsa össze a csomagját'),
  step1Intro: P(
    'Vpiši, komu paket pripada, izberi jezik dokumenta in katere denarnice naj bodo v njem.',
    'Say who the package belongs to, pick the language of the document, and choose which wallets belong in it.',
    'Adja meg, kié a csomag, válassza ki a dokumentum nyelvét, és hogy mely tárcák kerüljenek bele.',
  ),
  fullNameLabel: P('Ime in priimek', 'Full name', 'Teljes név'),
  fullNamePlaceholder: P('Janez Novak', 'Jane Doe', 'Kovács János'),
  fullNameMissing: P('Vpiši ime in priimek.', 'Enter a full name.', 'Adja meg a teljes nevet.'),
  descriptionLabel: P('Opis', 'Description', 'Leírás'),
  descriptionOptional: P('neobvezno', 'optional', 'nem kötelező'),
  descriptionPlaceholder: P(
    'npr. Družinski prihranki 2026',
    'e.g. Family savings 2026',
    'pl. Családi megtakarítás 2026',
  ),
  descriptionHint: P(
    'Kar vpišeš sem, bo natisnjeno na vsaki denarnici v paketu.',
    'Whatever you write here is printed on every wallet in the package.',
    'Amit ide ír, a csomag minden tárcájára rákerül.',
  ),

  // ── Step 1 — the language of the printed document ──────────────────────
  docLangLabel: P('Jezik dokumenta', 'Language of the document', 'A dokumentum nyelve'),
  docLangHint: P(
    'V tem jeziku bo natisnjen paket. Ni nujno isti kot jezik te strani.',
    'The package is printed in this language. It need not be the language of this page.',
    'A csomag ezen a nyelven készül. Nem kell megegyeznie az oldal nyelvével.',
  ),

  chooseWallets: P(
    'Katere denarnice želiš v paketu?',
    'Which wallets do you want in the package?',
    'Mely tárcák kerüljenek a csomagba?',
  ),
  chooseWalletsHint: P(
    'Glavno denarnico lahko izbereš samo eno. Lana8Wonder pride vedno kot komplet osmih.',
    'You can hold only one Main Wallet. Lana8Wonder always comes as a set of eight.',
    'Fő tárcából csak egy lehet. A Lana8Wonder mindig nyolc tárcából álló készlet.',
  ),
  included: P('V paketu', 'In the package', 'A csomagban'),
  notIncluded: P('Ni v paketu', 'Not in the package', 'Nincs a csomagban'),
  add: P('Dodaj', 'Add', 'Hozzáadás'),
  remove: P('Odstrani', 'Remove', 'Eltávolítás'),
  addOne: P('Dodaj eno', 'Add one', 'Egyet hozzáad'),
  removeOne: P('Odstrani eno', 'Remove one', 'Egyet elvesz'),
  countLabel: P('Število', 'Count', 'Darabszám'),
  fixedSet: P('komplet 8 denarnic', 'set of 8 wallets', '8 tárcából álló készlet'),
  onlyOne: P('samo ena', 'only one', 'csak egy'),
  severalAllowed: P('lahko jih je več', 'several allowed', 'több is lehet'),

  packageEmpty: P(
    'Izberi vsaj eno denarnico.',
    'Choose at least one wallet.',
    'Válasszon legalább egy tárcát.',
  ),
  packageTooBig: (max: number) =>
    P(
      `V en paket gre največ ${max} ${sl(max, 'denarnica', 'denarnici', 'denarnice', 'denarnic')}.`,
      `A single package holds at most ${max} ${en(max, 'wallet', 'wallets')}.`,
      `Egy csomagba legfeljebb ${max} tárca fér.`,
    ),
  walletsInPackage: (n: number) =>
    P(
      `${n} ${sl(n, 'denarnica', 'denarnici', 'denarnice', 'denarnic')} v paketu`,
      `${n} ${en(n, 'wallet', 'wallets')} in the package`,
      `${n} tárca a csomagban`,
    ),

  // ── Step 2 — keys ──────────────────────────────────────────────────────
  step2Heading: P('Vnesi zasebne ključe', 'Enter the private keys', 'Adja meg a privát kulcsokat'),
  step2Intro: P(
    'Za vsako denarnico prilepi ali skeniraj njen zasebni ključ (WIF). Naslov denarnice se izračuna sam, tukaj v tvojem brskalniku.',
    'For every wallet, paste or scan its private key (WIF). The wallet address is worked out for you, right here in your browser.',
    'Minden tárcához illessze be vagy olvassa be a privát kulcsát (WIF). A tárca címét a böngészője számolja ki, itt helyben.',
  ),
  keyLabel: P('Zasebni ključ (WIF)', 'Private key (WIF)', 'Privát kulcs (WIF)'),
  keyPlaceholder: P('T…', 'T…', 'T…'),
  scan: P('Skeniraj', 'Scan', 'Beolvasás'),
  addressLabel: P('Naslov denarnice', 'Wallet address', 'Tárca címe'),
  progressFilled: (done: number, total: number) =>
    P(`Izpolnjenih ${done} od ${total}`, `${done} of ${total} filled in`, `${done} / ${total} kitöltve`),
  allFilled: P(
    'Vse denarnice so izpolnjene.',
    'Every wallet is filled in.',
    'Minden tárca ki van töltve.',
  ),
  stillMissing: (n: number) =>
    P(
      `${sl(n, 'Manjka', 'Manjkata', 'Manjkajo', 'Manjka')} še ${n} ${sl(n, 'ključ', 'ključa', 'ključi', 'ključev')}.`,
      `${n} ${en(n, 'key', 'keys')} still missing.`,
      `Még ${n} kulcs hiányzik.`,
    ),

  errNotAKey: P(
    'To ni videti kot zasebni ključ LanaCoin.',
    'That does not look like a LanaCoin private key.',
    'Ez nem úgy néz ki, mint egy LanaCoin privát kulcs.',
  ),
  errWrongNetwork: P(
    'Ta ključ ni z omrežja LanaCoin.',
    'This key is not from the LanaCoin network.',
    'Ez a kulcs nem a LanaCoin hálózatról való.',
  ),
  errChecksum: P(
    'Ključ je nepopoln ali napačno prepisan.',
    'The key is incomplete or mistyped.',
    'A kulcs hiányos vagy elgépelt.',
  ),
  errNoCrypto: P(
    'Brskalnik tukaj ne da dostopa do šifriranja. Odpri stran prek https:// ali na tej napravi.',
    'The browser withholds cryptography here. Open the page over https:// or on this device.',
    'A böngésző itt nem ad hozzáférést a titkosításhoz. Nyissa meg az oldalt https:// címen vagy ezen az eszközön.',
  ),
  /**
   * Naming the wallet that already holds the key matters more than saying there
   * is a clash: on a sheet of twelve rows, "already used" leaves the person
   * hunting for where.
   */
  errDuplicateAt: (where: string) =>
    P(
      `Ta ključ je v paketu že pri: ${where}.`,
      `This key is already in the package at: ${where}.`,
      `Ez a kulcs már szerepel a csomagban itt: ${where}.`,
    ),
  /** Shown inside the camera while it keeps looking, so the scan can be redone on the spot. */
  scanDuplicateAt: (where: string) =>
    P(
      `Ta ključ si že poskeniral — je pri: ${where}. Poskeniraj drugo denarnico.`,
      `You have already scanned this key — it is at: ${where}. Scan a different wallet.`,
      `Ezt a kulcsot már beolvasta — itt van: ${where}. Olvasson be másik tárcát.`,
    ),
  stillDuplicate: (n: number) =>
    P(
      `${n} ${sl(n, 'denarnica ima', 'denarnici imata', 'denarnice imajo', 'denarnic ima')} ključ, ki je v paketu že drugje.`,
      `${n} ${en(n, 'wallet holds a key', 'wallets hold a key')} that is already elsewhere in the package.`,
      `${n} tárca olyan kulcsot tartalmaz, amely már máshol is szerepel a csomagban.`,
    ),

  // ── Step 3 — the document ──────────────────────────────────────────────
  step3Heading: P('Paket je pripravljen', 'The package is ready', 'A csomag elkészült'),
  step3Intro: P(
    'Preglej povzetek in prenesi dokument. Nastane v tvojem brskalniku — nič ne gre na noben strežnik.',
    'Check the summary and download the document. It is made in your browser — nothing goes to any server.',
    'Nézze át az összegzést, és töltse le a dokumentumot. A böngészőjében készül — semmi nem kerül szerverre.',
  ),
  downloadPdf: P('Prenesi PDF', 'Download PDF', 'PDF letöltése'),
  buildingPdf: P('Sestavljam dokument…', 'Building the document…', 'Dokumentum készítése…'),
  pdfPages: (n: number) =>
    P(
      `${n} ${sl(n, 'stran', 'strani', 'strani', 'strani')}`,
      `${n} ${en(n, 'page', 'pages')}`,
      `${n} oldal`,
    ),
  pdfFailed: P(
    'Dokumenta ni bilo mogoče sestaviti.',
    'The document could not be built.',
    'A dokumentumot nem sikerült elkészíteni.',
  ),
  printHint: P(
    'Tiskaj na A4, brez prilagajanja velikosti (100 %), po možnosti na debelejši papir.',
    'Print on A4 at 100 % scale, with no shrink-to-fit, ideally on heavier paper.',
    'Nyomtassa A4-re, 100%-os méretben, méretre igazítás nélkül, lehetőleg vastagabb papírra.',
  ),

  // ── Safety ─────────────────────────────────────────────────────────────
  localOnly: P(
    'Vse se zgodi v tvojem brskalniku. Noben ključ ne zapusti te naprave.',
    'Everything happens in your browser. No key ever leaves this device.',
    'Minden a böngészőjében történik. Egyetlen kulcs sem hagyja el ezt az eszközt.',
  ),
  keySafety: P(
    'Kdor ima zasebni ključ, ima denar. Ta dokument hrani tako, kot bi hranil gotovino.',
    'Whoever holds the private key holds the money. Keep this document as you would keep cash.',
    'Akinél a privát kulcs van, azé a pénz. Őrizze ezt a dokumentumot úgy, mint a készpénzt.',
  ),

  // ── Printed document ───────────────────────────────────────────────────
  pdfCoverTitle: P('Papirnate denarnice', 'Paper Wallets', 'Papír tárcák'),
  pdfCoverOwner: P('Paket pripada', 'This package belongs to', 'A csomag tulajdonosa'),
  pdfCoverContents: P('Vsebina paketa', 'Contents of the package', 'A csomag tartalma'),
  pdfCoverIssued: P('Izdano', 'Issued', 'Kiállítva'),
  pdfWalletAddress: P('Naslov denarnice', 'Wallet address', 'Tárca címe'),
  pdfPrivateKey: P('Zasebni ključ', 'Private key', 'Privát kulcs'),
  pdfScanToReceive: P('Skeniraj za prejem', 'Scan to receive', 'Olvassa be a fogadáshoz'),
  pdfScanToSpend: P('Skeniraj za razpolaganje', 'Scan to spend', 'Olvassa be a költéshez'),
  pdfPositionOf: (n: number, total: number) =>
    P(`${n} od ${total}`, `${n} of ${total}`, `${n} / ${total}`),

  // ── On lanapaper.online's own landing page ─────────────────────────────
  packageBack: P(
    'Nazaj na lanapaper.online',
    'Back to lanapaper.online',
    'Vissza a lanapaper.online oldalra',
  ),
} as const;
