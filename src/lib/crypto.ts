// Default import, not `import * as`: elliptic is CommonJS, and a namespace
// import of it has no `.ec` outside a bundler — which is what tools/verify-wif.mjs
// runs it as. Both forms give the same object under Vite; this one also loads
// under plain node. Same `ec`, same behaviour.
import elliptic from 'elliptic';
import CryptoJS from 'crypto-js';
import { bech32 } from 'bech32';

// Initialize secp256k1 elliptic curve
const ec = new elliptic.ec('secp256k1');

/**
 * LanaCoin's own version bytes, from the coin's src/chainparams.cpp:
 *   SECRET_KEY     = 176 (0xb0) — the prefix of a WIF private key
 *   PUBKEY_ADDRESS =  48 (0x30) — the prefix of an address
 * They are exported so nothing has to re-type the numbers.
 */
export const LANA_WIF_VERSION = 0xb0;
/**
 * The other container the Lana fleet actually emits.
 *
 * LanaCoin's own src/chainparams.cpp sets SECRET_KEY = 176 (0xB0), and nothing
 * in the coin knows about 0x41. But 100Million2Everyone encodes every wallet it
 * creates as 0x41 + key + 0x01, and derives the address from the compressed
 * public key over version 0x30 exactly as this file does — so the key inside is
 * a real LanaCoin key and the address is a real LanaCoin address. Only the
 * envelope is non-standard; a 0x41 WIF is 52 characters and starts with 'A'
 * rather than 'T'.
 *
 * Refusing it would mean refusing keys people are holding, so it is read. It is
 * never WRITTEN: generateNewWallet emits 0xB0, the form LanaCoin core imports.
 */
export const LANA_WIF_VERSION_100M = 0x41;

/** Every container a LanaCoin private key is known to arrive in. */
export const LANA_WIF_VERSIONS = [LANA_WIF_VERSION, LANA_WIF_VERSION_100M];
export const LANA_ADDRESS_VERSION = 0x30;

/** The two version bytes as the two hex characters they occupy in a payload. */
const LANA_WIF_VERSION_HEX = LANA_WIF_VERSION.toString(16).padStart(2, '0');
const LANA_ADDRESS_VERSION_HEX = LANA_ADDRESS_VERSION.toString(16).padStart(2, '0');

// Utility functions

/**
 * Normalizes string by removing all whitespace and zero-width characters
 * This handles invisible characters that can be added during copy/paste
 */
export function normalizePrivateKey(input: string): string {
  // Remove all standard whitespace, zero-width spaces, and other invisible characters
  return input.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

export function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// SHA-256 hash function using Web Crypto API
export async function sha256(hex: string): Promise<string> {
  const bytes = hexToBytes(hex);
  const buffer = new Uint8Array(bytes);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// RIPEMD160 hash function
function ripemd160(data: string): string {
  return CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(data)).toString();
}

// Double SHA-256 hash (used for checksums)
async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const hex = bytesToHex(data);
  const firstHash = await sha256(hex);
  const secondHash = await sha256(firstHash);
  return new Uint8Array(hexToBytes(secondHash));
}

// Base58 encoding (matching reference implementation)
function base58Encode(bytes: number[] | Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const byteArray = Array.isArray(bytes) ? new Uint8Array(bytes) : bytes;
  let num = BigInt('0x' + bytesToHex(byteArray));
  let encoded = "";
  while (num > 0n) {
    let remainder = num % 58n;
    num = num / 58n;
    encoded = alphabet[Number(remainder)] + encoded;
  }
  for (const byte of byteArray) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded;
}

// Base58 decoding (matching reference implementation)
function base58Decode(encoded: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let decoded = 0n;
  let multi = 1n;
  
  for (let i = encoded.length - 1; i >= 0; i--) {
    const char = encoded[i];
    const charIndex = alphabet.indexOf(char);
    if (charIndex === -1) throw new Error('Invalid Base58 character');
    decoded += BigInt(charIndex) * multi;
    multi *= 58n;
  }
  
  const hex = decoded.toString(16);
  const paddedHex = hex.length % 2 ? '0' + hex : hex;
  let bytes = new Uint8Array(hexToBytes(paddedHex));
  
  // Add leading zeros for '1' characters
  let leadingOnes = 0;
  for (const char of encoded) {
    if (char === '1') leadingOnes++;
    else break;
  }
  
  if (leadingOnes > 0) {
    const leadingZeros = new Uint8Array(leadingOnes);
    const combined = new Uint8Array(leadingZeros.length + bytes.length);
    combined.set(leadingZeros);
    combined.set(bytes, leadingZeros.length);
    bytes = combined;
  }
  
  return bytes;
}

/**
 * The same decoding, but written so that "this is not base58" is an answer
 * rather than an exception — a person typing a key into a box gets it wrong all
 * the time, and that is ordinary, not exceptional. Written out rather than
 * wrapped around base58Decode above, because that one cannot tell an empty
 * string from the single byte 0x00: both leave it with the digits 0, and it
 * pads them back up to one zero byte. Here an empty input is null, and only a
 * leading '1' produces a leading zero byte.
 *
 * base58Decode itself is left exactly as it is — wifToPrivateKey depends on it
 * throwing.
 */
export function tryBase58Decode(input: string): Uint8Array | null {
  if (!input) return null;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  let num = 0n;
  for (const char of input) {
    const digit = alphabet.indexOf(char);
    if (digit === -1) return null;
    num = num * 58n + BigInt(digit);
  }

  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = num === 0n ? [] : hexToBytes(hex);

  // Every leading '1' is one leading zero byte — base58 has no other way to
  // carry them, since they do not change the number.
  let leadingZeros = 0;
  for (const char of input) {
    if (char !== '1') break;
    leadingZeros++;
  }

  const out = new Uint8Array(leadingZeros + body.length);
  out.set(body, leadingZeros);
  return out;
}

/**
 * Result of WIF decoding — includes compression flag
 */
export interface WifDecodeResult {
  privateKeyHex: string;
  isCompressed: boolean;
}

/**
 * Converts WIF (Wallet Import Format) to private key hex
 * Accepts both LanaCoin WIF formats:
 *   - Old uncompressed: prefix 0xB0 (starts with '6', 51 chars)
 *   - New compressed:   prefix 0x41 (starts with 'T', 52 chars)
 */
export async function wifToPrivateKey(wif: string): Promise<WifDecodeResult> {
  try {
    // Normalize input to remove invisible characters
    const cleanWif = normalizePrivateKey(wif);

    // 1. Decode Base58 to bytes
    const decoded = base58Decode(cleanWif);

    // 2. Split payload and checksum
    const payload = decoded.slice(0, -4);     // All except last 4 bytes
    const checksum = decoded.slice(-4);       // Last 4 bytes

    // 3. Verify checksum using double SHA256
    const computedChecksum = (await sha256d(payload)).slice(0, 4);

    // 4. Validate checksum matches
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== computedChecksum[i]) {
        throw new Error('Invalid WIF checksum');
      }
    }

    // 5. Verify LanaCoin prefix — accept BOTH formats
    //    0xB0 = old uncompressed (altcoin convention: 0x30 + 0x80)
    //    0x41 = new compressed (from chainparams.cpp SECRET_KEY=65)
    if (!LANA_WIF_VERSIONS.includes(payload[0])) {
      throw new Error('Invalid LANA WIF prefix - expected 0xB0 or 0x41, got 0x' + payload[0].toString(16));
    }

    // 6. Detect compression
    //    33 bytes = version(1) + key(32) → uncompressed
    //    34 bytes = version(1) + key(32) + flag(1) → compressed
    const isCompressed = payload.length === 34 && payload[33] === 0x01;

    // 7. Extract 32-byte private key (bytes 1-33) — same slice for both
    const privateKeyBytes = payload.slice(1, 33);
    return { privateKeyHex: bytesToHex(privateKeyBytes), isCompressed };
  } catch (error) {
    throw new Error(`Failed to decode WIF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates public key from private key using secp256k1
 */
function generatePublicKey(privateKeyHex: string): string {
  try {
    // 1. Generate key pair from private key
    const keyPair = ec.keyFromPrivate(privateKeyHex);
    
    // 2. Get public key point
    const pubKeyPoint = keyPair.getPublic();
    
    // 3. Format as uncompressed public key (04 + X + Y coordinates)
    return "04" + 
           pubKeyPoint.getX().toString(16).padStart(64, '0') + 
           pubKeyPoint.getY().toString(16).padStart(64, '0');
  } catch (error) {
    throw new Error(`Failed to generate public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates compressed public key from private key using secp256k1
 * Returns 33 bytes: prefix (02 if y even, 03 if y odd) + x coordinate
 */
export function generateCompressedPublicKey(privateKeyHex: string): string {
  try {
    const keyPair = ec.keyFromPrivate(privateKeyHex);
    const pubKeyPoint = keyPair.getPublic();

    // Determine prefix based on y-coordinate parity
    const yBN = pubKeyPoint.getY();
    const prefix = yBN.isEven() ? "02" : "03";

    return prefix + pubKeyPoint.getX().toString(16).padStart(64, '0');
  } catch (error) {
    throw new Error(`Failed to generate compressed public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates LanaCoin address from public key
 * Uses Hash160 (SHA256 + RIPEMD160) with version byte 0x30
 */
export async function generateLanaAddress(publicKeyHex: string): Promise<string> {
  try {
    // 1. SHA-256 hash of public key
    const sha256Hash = await sha256(publicKeyHex);
    
    // 2. RIPEMD160 hash of SHA-256 result
    const hash160 = ripemd160(sha256Hash);
    
    // 3. Add LanaCoin version byte (0x30 = 48 decimal)
    const versionedPayload = LANA_ADDRESS_VERSION_HEX + hash160;
    
    // 4. Calculate checksum (double SHA-256)
    const firstHash = await sha256(versionedPayload);
    const checksum = await sha256(firstHash);
    
    // 5. Encode with Base58Check
    const finalAddress = base58Encode(new Uint8Array(hexToBytes(versionedPayload + checksum.substring(0, 8))));
    return finalAddress;
  } catch (error) {
    throw new Error(`Failed to generate LANA address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Derives Nostr x-only public key from private key
 */
function deriveNostrPublicKey(privateKeyHex: string): string {
  try {
    // 1. Generate key pair from private key
    const keyPair = ec.keyFromPrivate(privateKeyHex);
    
    // 2. Get public key point
    const pubKeyPoint = keyPair.getPublic();
    
    // 3. Extract x-only public key (32 bytes)
    const xOnlyPublicKey = pubKeyPoint.getX().toString(16).padStart(64, '0');
    
    return xOnlyPublicKey;
  } catch (error) {
    throw new Error(`Failed to derive Nostr public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Converts hex public key to Nostr npub format using bech32
 */
function hexToNpub(hexPubKey: string): string {
  try {
    // 1. Convert hex to bytes
    const pubKeyBytes = new Uint8Array(hexToBytes(hexPubKey));
    
    // 2. Convert bytes to bech32 5-bit groups
    const words = bech32.toWords(pubKeyBytes);
    
    // 3. Encode with 'npub' prefix
    return bech32.encode('npub', words);
  } catch (error) {
    throw new Error(`Failed to convert to npub format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Converts hex private key to Nostr nsec format using bech32
 */
function hexToNsec(privateKeyHex: string): string {
  try {
    // 1. Convert hex to bytes
    const privateKeyBytes = new Uint8Array(hexToBytes(privateKeyHex));
    
    // 2. Convert bytes to bech32 5-bit groups
    const words = bech32.toWords(privateKeyBytes);
    
    // 3. Encode with 'nsec' prefix
    return bech32.encode('nsec', words);
  } catch (error) {
    throw new Error(`Failed to convert to nsec format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main conversion function - converts WIF private key to Wallet IDs and Nostr identifiers
 * Derives BOTH compressed and uncompressed wallet addresses from the same private key
 */
export interface ConversionResult {
  walletId: string;
  compressedWalletId: string;
  uncompressedWalletId: string;
  isCompressed: boolean;
  nostrHexId: string;
  nostrNpubId: string;
  nostrNsecId: string;
  privateKeyHex: string;
}

export async function convertWifToIds(wif: string): Promise<ConversionResult> {
  try {
    // Normalize input to remove invisible characters
    const cleanWif = normalizePrivateKey(wif);

    // Step 1: Extract private key from WIF (detects format)
    const { privateKeyHex, isCompressed } = await wifToPrivateKey(cleanWif);

    // Step 2: Generate both public key types
    const uncompressedPubKey = generatePublicKey(privateKeyHex);
    const compressedPubKey = generateCompressedPublicKey(privateKeyHex);

    // Step 3: Generate BOTH LanaCoin Wallet IDs
    const uncompressedWalletId = await generateLanaAddress(uncompressedPubKey);
    const compressedWalletId = await generateLanaAddress(compressedPubKey);

    // Primary address matches the WIF compression flag
    const walletId = isCompressed ? compressedWalletId : uncompressedWalletId;

    // Step 4: Derive Nostr identifiers
    const nostrHexId = deriveNostrPublicKey(privateKeyHex);
    const nostrNpubId = hexToNpub(nostrHexId);
    const nostrNsecId = hexToNsec(privateKeyHex);

    return {
      walletId,
      compressedWalletId,
      uncompressedWalletId,
      isCompressed,
      nostrHexId,
      nostrNpubId,
      nostrNsecId,
      privateKeyHex
    };
  } catch (error) {
    throw new Error(`Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a new random LanaCoin wallet (private key WIF + address)
 */
export async function generateNewWallet(): Promise<{ wif: string; address: string }> {
  // 1. Generate 32 random bytes for private key
  const privateKeyBytes = new Uint8Array(32);
  window.crypto.getRandomValues(privateKeyBytes);
  const privateKeyHex = bytesToHex(privateKeyBytes);

  // 2. Encode as WIF with LanaCoin prefix 0xB0 + compression flag 0x01 (Staking, starts with T)
  const extendedKey = LANA_WIF_VERSION_HEX + privateKeyHex + "01";
  const firstHash = await sha256(extendedKey);
  const secondHash = await sha256(firstHash);
  const checksum = secondHash.substring(0, 8);
  const wifHex = extendedKey + checksum;
  const wif = base58Encode(new Uint8Array(hexToBytes(wifHex)));

  // 3. Generate compressed public key and address
  const publicKeyHex = generateCompressedPublicKey(privateKeyHex);
  const address = await generateLanaAddress(publicKeyHex);

  return { wif, address };
}

/**
 * Validates if a string looks like a valid WIF private key
 */
export async function isValidWifFormat(wif: string): Promise<boolean> {
  try {
    // Normalize input to remove invisible characters
    const cleanWif = normalizePrivateKey(wif);
    
    // Basic format checks
    if (!cleanWif || typeof cleanWif !== 'string') return false;
    if (cleanWif.length < 50 || cleanWif.length > 55) return false;
    
    // Try to decode - this will throw if invalid
    await wifToPrivateKey(cleanWif);
    return true;
  } catch {
    return false;
  }
}