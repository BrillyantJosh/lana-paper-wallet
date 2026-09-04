import mainThumb from '@/assets/thumbs/main.jpg';
import walletThumb from '@/assets/thumbs/wallet.jpg';
import retailThumb from '@/assets/thumbs/retail.jpg';
import l8wThumb from '@/assets/thumbs/l8w.jpg';
import coverThumb from '@/assets/thumbs/cover.jpg';
import type { Bilingual } from './packageStrings';

export type WalletKindId = 'main' | 'wallet' | 'retail' | 'l8w';

/** A rectangle on the page, as fractions (0–1) of page width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WalletKind {
  id: WalletKindId;
  name: Bilingual;
  /** The character of this wallet type — shown in the picker and on the printed page. */
  tagline: Bilingual;
  /** Print-resolution ornament, served from /public and fetched only when a PDF is built. */
  ornamentUrl: string;
  /** Small preview bundled with the app, for the picker. */
  thumbUrl: string;
  /**
   * Largest all-white rectangle inside the ornament — everything the PDF draws
   * must stay inside it. Measured with `node tools/find-content-box.mjs`.
   */
  contentBox: Box;
  /** How many wallets of this kind a package may hold. */
  minCount: number;
  maxCount: number;
  /** Set for kinds that always come as a fixed-size set (Lana8Wonder is always 8). */
  fixedCount?: number;
  /** Wallets of this kind carry a position number, on the form and in the PDF. */
  numbered: boolean;
}

/**
 * Every ornament is a full-bleed A4 engraving with a clear white middle. The
 * ornaments are 2:3, the page is 1:√2, so a page draws its ornament fitted to
 * the page height — the leftover strip on each side is paper white anyway.
 */
export const WALLET_KINDS: WalletKind[] = [
  {
    id: 'main',
    name: { sl: 'Glavna denarnica', en: 'Main Wallet' },
    tagline: {
      sl: 'Denarnica, ki odklene vsa vrata.',
      en: 'The wallet that unlocks every door.',
    },
    ornamentUrl: '/ornaments/main.png',
    thumbUrl: mainThumb,
    contentBox: { x: 0.1510, y: 0.3470, w: 0.6996, h: 0.3660 },
    minCount: 1,
    maxCount: 1,
    fixedCount: 1,
    numbered: false,
  },
  {
    id: 'wallet',
    name: { sl: 'Denarnica', en: 'Wallet' },
    tagline: {
      sl: 'Tvoja mirna, vsakdanja denarnica.',
      en: 'Your calm, everyday wallet.',
    },
    ornamentUrl: '/ornaments/wallet.png',
    thumbUrl: walletThumb,
    contentBox: { x: 0.1749, y: 0.1738, w: 0.6507, h: 0.7053 },
    minCount: 1,
    maxCount: 40,
    numbered: false,
  },
  {
    id: 'retail',
    name: { sl: 'Nakupovalna denarnica', en: 'Retail Wallet' },
    tagline: {
      sl: 'Za trošenje v ekonomiji Obilja.',
      en: 'For spending in the economy of Abundance.',
    },
    ornamentUrl: '/ornaments/retail.png',
    thumbUrl: retailThumb,
    contentBox: { x: 0.2388, y: 0.2524, w: 0.5245, h: 0.4839 },
    minCount: 1,
    maxCount: 40,
    numbered: false,
  },
  {
    id: 'l8w',
    name: { sl: 'Lana8Wonder', en: 'Lana8Wonder' },
    tagline: {
      sl: 'Osem denarnic, osem čudes.',
      en: 'Eight wallets, eight wonders.',
    },
    ornamentUrl: '/ornaments/l8w.png',
    thumbUrl: l8wThumb,
    contentBox: { x: 0.1297, y: 0.3638, w: 0.7422, h: 0.3717 },
    minCount: 8,
    maxCount: 8,
    fixedCount: 8,
    numbered: true,
  },
];

export const COVER_ORNAMENT = {
  ornamentUrl: '/ornaments/cover.png',
  thumbUrl: coverThumb,
  contentBox: { x: 0.1845, y: 0.2791, w: 0.6320, h: 0.5242 } as Box,
  /**
   * The blank oval inside the engraved arch, high above the content box. The
   * arch was drawn around a mark; leaving it empty and setting the mark below
   * it reads as two attempts at the same thing.
   */
  cartouche: { x: 0.4417, y: 0.0994, w: 0.1182, h: 0.0977 } as Box,
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
  /** Bilingual reason the input was rejected, or null while it is still empty. */
  error: Bilingual | null;
}

export interface PackageDraft {
  fullName: string;
  description: string;
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
