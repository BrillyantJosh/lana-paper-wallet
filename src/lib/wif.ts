import elliptic from 'elliptic';
import {
  bytesToHex,
  generateCompressedPublicKey,
  generateLanaAddress,
  sha256,
  tryBase58Decode,
  LANA_WIF_VERSIONS,
} from '@/lib/crypto';

const ec = new elliptic.ec('secp256k1');

/** Order of the secp256k1 group — a private key must be in [1, n-1]. */
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

/**
 * Characters a scan or a PDF paste can smuggle in: every JS whitespace class
 * member (that already covers the non-breaking space and the BOM) plus the
 * zero-width joiners, which are invisible and would otherwise fail base58.
 */
const STRIPPABLE = /[\s\u200b\u200c\u200d]/g;

/** A leading URI scheme, e.g. "lanacoin:" or "lana://" — base58 has no ":". */
const URI_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?/;

export type WifError = 'notAKey' | 'wrongNetwork' | 'checksum';

export type DecodedKey =
  | {
      ok: true;
      wif: string;
      address: string;
      compressed: boolean;
      /**
       * Fingerprint of the secret itself, for telling two rows apart. The
       * compressed and uncompressed encodings of ONE key look different and
       * derive DIFFERENT addresses, yet spend the same coins — so neither the
       * typed text nor the address can be used to spot that collision. This
       * can: it is the same for both encodings. It is a hash, so holding it is
       * not holding the key.
       */
      keyId: string;
    }
  | { ok: false; reason: WifError };

export function normalizeKeyInput(raw: string): string {
  if (!raw) return '';
  return raw.replace(STRIPPABLE, '').replace(URI_SCHEME, '');
}

/** '04' + X + Y, each coordinate padded to 32 bytes — the legacy public key form. */
function generateUncompressedPublicKey(privateKeyHex: string): string {
  const point = ec.keyFromPrivate(privateKeyHex).getPublic();
  const x = point.getX().toString(16).padStart(64, '0');
  const y = point.getY().toString(16).padStart(64, '0');
  return '04' + x + y;
}

export async function decodeWif(input: string): Promise<DecodedKey> {
  const wif = normalizeKeyInput(input);
  // tryBase58Decode, not the throwing base58Decode next to it: a person typing
  // a key gets a character wrong all the time, and that is an answer, not a
  // crash.
  const bytes = tryBase58Decode(wif);
  if (!bytes) return { ok: false, reason: 'notAKey' };

  let compressed: boolean;
  if (bytes.length === 37) {
    compressed = false;
  } else if (bytes.length === 38) {
    // The byte between the key and the checksum is the compression flag; any
    // other value means this is not a WIF, whatever else happens to line up.
    if (bytes[33] !== 0x01) return { ok: false, reason: 'notAKey' };
    compressed = true;
  } else {
    return { ok: false, reason: 'notAKey' };
  }

  // The checksum is settled before the version byte. A real key from another
  // chain has a sound checksum, so it still reports wrongNetwork — while a
  // mistyped Lana key, whose typo happens to land on the first character, is
  // told it was mistyped instead of being blamed on another chain.
  const body = bytes.subarray(0, bytes.length - 4);
  const expected = bytesToHex(bytes.subarray(bytes.length - 4));
  const actual = (await sha256(await sha256(bytesToHex(body)))).substring(0, 8);
  if (actual !== expected) return { ok: false, reason: 'checksum' };

  // Two containers, one coin: 0xB0 is what LanaCoin core writes, 0x41 is what
  // 100Million2Everyone writes. Both hold a real key over a real 0x30 address —
  // see LANA_WIF_VERSIONS. Anything else genuinely is another chain.
  if (!LANA_WIF_VERSIONS.includes(bytes[0])) return { ok: false, reason: 'wrongNetwork' };

  const privateKeyHex = bytesToHex(bytes.subarray(1, 33));
  const priv = BigInt('0x' + privateKeyHex);
  if (priv === 0n || priv >= SECP256K1_N) return { ok: false, reason: 'notAKey' };

  const publicKeyHex = compressed
    ? generateCompressedPublicKey(privateKeyHex)
    : generateUncompressedPublicKey(privateKeyHex);
  const address = await generateLanaAddress(publicKeyHex);
  const keyId = await sha256(privateKeyHex);

  return { ok: true, wif, address, compressed, keyId };
}
