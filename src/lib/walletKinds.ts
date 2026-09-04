import mainThumb from '@/assets/thumbs/main.jpg';
import walletThumb from '@/assets/thumbs/wallet.jpg';
import retailThumb from '@/assets/thumbs/retail.jpg';
import l8wThumb from '@/assets/thumbs/l8w.jpg';
import coverThumb from '@/assets/thumbs/cover.jpg';
import { P, type Lang, type Phrase } from './packageStrings';

export type WalletKindId = 'main' | 'wallet' | 'retail' | 'l8w';

/**
 * A piece of engraving the PDF places by itself.
 *
 * The ornaments used to be full A4 sheets, and every page's text had to fit
 * whatever gap the picture happened to leave — a different gap on every kind,
 * measured by hand. They are now cut into two trimmed pieces, a mandala crown
 * and a small footer motif (see tools/split-ornament.mjs), which the layout
 * places where it wants them. The middle of the sheet is simply empty, the same
 * on every kind, and the codes and the type could finally grow.
 *
 * `aspect` is width / height of the trimmed image, so it can be drawn to a
 * chosen height without distortion.
 */
export interface Ornament {
  url: string;
  aspect: number;
}

export interface WalletKind {
  id: WalletKindId;
  name: Phrase;
  /** The character of this wallet type — shown in the picker and on the printed page. */
  tagline: Phrase;
  crown: Ornament;
  footer: Ornament;
  /** Small preview bundled with the app, for the picker. */
  thumbUrl: string;
  /** How many wallets of this kind a package may hold. */
  minCount: number;
  maxCount: number;
  /** Set for kinds that always come as a fixed-size set (Lana8Wonder is always 8). */
  fixedCount?: number;
  /** Wallets of this kind carry a position number, on the form and in the PDF. */
  numbered: boolean;
}

export const WALLET_KINDS: WalletKind[] = [
  {
    id: 'main',
    name: P('Glavna denarnica', 'Main Wallet', 'Fő tárca'),
    tagline: P(
      'Denarnica, ki odklene vsa vrata.',
      'The wallet that unlocks every door.',
      'A tárca, amely minden ajtót kinyit.',
    ),
    crown: { url: '/ornaments/main-crown.png', aspect: 0.9982 },
    footer: { url: '/ornaments/main-footer.png', aspect: 1.0244 },
    thumbUrl: mainThumb,
    minCount: 1,
    maxCount: 1,
    fixedCount: 1,
    numbered: false,
  },
  {
    id: 'wallet',
    name: P('Denarnica', 'Wallet', 'Tárca'),
    tagline: P(
      'Tvoja mirna, vsakdanja denarnica.',
      'Your calm, everyday wallet.',
      'A nyugodt, mindennapi tárcája.',
    ),
    crown: { url: '/ornaments/wallet-crown.png', aspect: 0.9946 },
    footer: { url: '/ornaments/wallet-footer.png', aspect: 0.875 },
    thumbUrl: walletThumb,
    minCount: 1,
    maxCount: 40,
    numbered: false,
  },
  {
    id: 'retail',
    name: P('Nakupovalna denarnica', 'Retail Wallet', 'Vásárlói tárca'),
    tagline: P(
      'Za trošenje v ekonomiji Obilja.',
      'For spending in the economy of Abundance.',
      'Költésre a Bőség gazdaságában.',
    ),
    crown: { url: '/ornaments/retail-crown.png', aspect: 1.0055 },
    footer: { url: '/ornaments/retail-footer.png', aspect: 1.0219 },
    thumbUrl: retailThumb,
    minCount: 1,
    maxCount: 40,
    numbered: false,
  },
  {
    id: 'l8w',
    name: P('Lana8Wonder', 'Lana8Wonder', 'Lana8Wonder'),
    tagline: P(
      'Osem denarnic, osem čudes.',
      'Eight wallets, eight wonders.',
      'Nyolc tárca, nyolc csoda.',
    ),
    crown: { url: '/ornaments/l8w-crown.png', aspect: 1.0436 },
    footer: { url: '/ornaments/l8w-footer.png', aspect: 1.0024 },
    thumbUrl: l8wThumb,
    minCount: 8,
    maxCount: 8,
    fixedCount: 8,
    numbered: true,
  },
];

export const COVER_ORNAMENT = {
  crown: { url: '/ornaments/cover-crown.png', aspect: 1.0092 } as Ornament,
  footer: { url: '/ornaments/cover-footer.png', aspect: 1.9718 } as Ornament,
  thumbUrl: coverThumb,
};

/** The whole package may not grow past this — a print job, not a database. */
export const MAX_WALLETS_PER_PACKAGE = 60;

export function walletKind(id: WalletKindId): WalletKind {
  const kind = WALLET_KINDS.find((k) => k.id === id);
  if (!kind) throw new Error(`unknown wallet kind: ${id}`);
  return kind;
}

/** One wallet in the package: which kind it is, where it sits, and its key. */
export interface WalletEntry {
  /** Stable identity for React keys and for restoring input focus. */
  uid: string;
  kind: WalletKindId;
  /** 1-based position within its kind. Printed only when the kind is numbered. */
  position: number;
  /** Exactly what the person typed or scanned, untouched. */
  input: string;
  /** Set once the input decodes to a valid LanaCoin private key. */
  wif: string | null;
  address: string | null;
  /**
   * Fingerprint of the secret behind this entry, from decodeWif. Two entries
   * hold the same money when their keyId matches, even though their addresses
   * differ — that is how one key entered in both its encodings is caught.
   */
  keyId: string | null;
  /** Reason the input was rejected, or null while it is still empty. */
  error: Phrase | null;
}

export interface PackageDraft {
  fullName: string;
  description: string;
  /**
   * The language the DOCUMENT is printed in — chosen on step 1, and not
   * necessarily the language of the screen. A package is often made for
   * somebody else.
   */
  docLang: Lang;
  /** How many wallets of each kind — absent or 0 means the kind is not included. */
  counts: Partial<Record<WalletKindId, number>>;
}

/** Expands a draft into the ordered list of wallets the person has to fill in. */
export function buildEntries(counts: PackageDraft['counts']): WalletEntry[] {
  const entries: WalletEntry[] = [];
  for (const kind of WALLET_KINDS) {
    const count = counts[kind.id] ?? 0;
    for (let i = 1; i <= count; i++) {
      entries.push({
        uid: `${kind.id}-${i}`,
        kind: kind.id,
        position: i,
        input: '',
        wif: null,
        address: null,
        keyId: null,
        error: null,
      });
    }
  }
  return entries;
}

export function totalWallets(counts: PackageDraft['counts']): number {
  return WALLET_KINDS.reduce((sum, k) => sum + (counts[k.id] ?? 0), 0);
}
