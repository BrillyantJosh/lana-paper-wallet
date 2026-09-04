/**
 * Proves the WIF decoding rules in src/lib/wif.ts are safe to print money with.
 *
 * Usage:  node tools/verify-wif.mjs
 *
 * It re-implements the same derivation from scratch — its own base58, Node's
 * own SHA-256 — and cross-checks that re-implementation against elliptic's own
 * public-key encoders. If the two ever disagree, one of them is printing a
 * wrong address.
 *
 * The last section then runs the SHIPPED src/lib/wif.ts itself over the same
 * corpus and demands the two agree character for character. Without it this
 * file would only prove that the rules are sound, never that the code the app
 * actually loads still follows them.
 *
 * Exits non-zero if any assertion failed.
 */
import { createHash, randomBytes } from 'crypto';
import { registerHooks } from 'node:module';
import elliptic from 'elliptic';
import CryptoJS from 'crypto-js';

/**
 * Node resolves ESM specifiers literally, but this app's TypeScript is written
 * for Vite: `@/lib/crypto` is the alias vite.config.ts maps to ./src, and no
 * import carries a file extension. Both are taught here, and only for files
 * that live under this repo's src/ — nothing under node_modules resolves any
 * differently because of it.
 */
const SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(spec, ctx, next) {
    // The `@/…` alias, from anywhere: it can only ever mean this repo's src/.
    if (spec.startsWith('@/')) {
      const target = SRC + spec.slice(2);
      return next(/\.[a-z]+$/i.test(target) ? target : target + '.ts', ctx);
    }
    const from = ctx?.parentURL ?? '';
    if (from.startsWith(SRC) && /^\.{1,2}\//.test(spec) && !/\.[a-z]+$/i.test(spec)) {
      return next(spec + '.ts', ctx);
    }
    return next(spec, ctx);
  },
});
const shipped = await import(SRC + 'lib/wif.ts');

const ec = new elliptic.ec('secp256k1');

const LANA_WIF_VERSION = 0xb0;
/** What 100Million2Everyone writes: a real Lana key in a non-standard envelope. */
const LANA_WIF_VERSION_100M = 0x41;
const LANA_WIF_VERSIONS = [LANA_WIF_VERSION, LANA_WIF_VERSION_100M];
const LANA_ADDRESS_VERSION = 0x30;
const BITCOIN_WIF_VERSION = 0x80;
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- independent primitives -------------------------------------------------

const toHex = bytes => Buffer.from(bytes).toString('hex');
const sha256 = hex => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
const doubleSha = hex => sha256(sha256(hex));
const ripemd160 = hex => CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(hex)).toString();

function base58Encode(bytes) {
  let num = BigInt('0x' + (toHex(bytes) || '0'));
  let out = '';
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

function base58Decode(input) {
  if (!input) return null;
  let num = 0n;
  for (const ch of input) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    num = num * 58n + BigInt(digit);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = num === 0n ? [] : [...Buffer.from(hex, 'hex')];
  let zeros = 0;
  for (const ch of input) {
    if (ch !== '1') break;
    zeros++;
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...body]);
}

// --- the algorithm under test, re-implemented -------------------------------

function normalizeKeyInput(raw) {
  if (!raw) return '';
  return raw.replace(/[\s\u200b\u200c\u200d]/g, '').replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?/, '');
}

function publicKey(privHex, compressed) {
  const point = ec.keyFromPrivate(privHex).getPublic();
  const x = point.getX().toString(16).padStart(64, '0');
  if (compressed) return (point.getY().isEven() ? '02' : '03') + x;
  return '04' + x + point.getY().toString(16).padStart(64, '0');
}

function address(pubKeyHex) {
  const payload = LANA_ADDRESS_VERSION.toString(16).padStart(2, '0') + ripemd160(sha256(pubKeyHex));
  return base58Encode(Buffer.from(payload + doubleSha(payload).substring(0, 8), 'hex'));
}

function encodeWif(privHex, compressed, version = LANA_WIF_VERSION) {
  const body = version.toString(16).padStart(2, '0') + privHex + (compressed ? '01' : '');
  return base58Encode(Buffer.from(body + doubleSha(body).substring(0, 8), 'hex'));
}

function decodeWif(input) {
  const wif = normalizeKeyInput(input);
  const bytes = base58Decode(wif);
  if (!bytes) return { ok: false, reason: 'notAKey' };

  let compressed;
  if (bytes.length === 37) compressed = false;
  else if (bytes.length === 38) {
    if (bytes[33] !== 0x01) return { ok: false, reason: 'notAKey' };
    compressed = true;
  } else return { ok: false, reason: 'notAKey' };

  const body = bytes.subarray(0, bytes.length - 4);
  if (doubleSha(toHex(body)).substring(0, 8) !== toHex(bytes.subarray(bytes.length - 4))) {
    return { ok: false, reason: 'checksum' };
  }

  if (!LANA_WIF_VERSIONS.includes(bytes[0])) return { ok: false, reason: 'wrongNetwork' };

  const privHex = toHex(bytes.subarray(1, 33));
  const priv = BigInt('0x' + privHex);
  if (priv === 0n || priv >= SECP256K1_N) return { ok: false, reason: 'notAKey' };

  return {
    ok: true,
    wif,
    address: address(publicKey(privHex, compressed)),
    compressed,
    keyId: createHash('sha256').update(Buffer.from(privHex, 'hex')).digest('hex'),
  };
}

// --- the checks -------------------------------------------------------------

/** Deterministic keys, so a failure here is reproducible rather than a fluke. */
const keys = Array.from({ length: 24 }, (_, i) =>
  createHash('sha256').update(`lana-paper-wallet/verify-wif/${i}`).digest('hex'));

console.log('verify-wif — LanaCoin WIF decoding\n');

console.log('round trip: encode, decode, re-derive');
for (const privHex of keys) {
  for (const compressed of [true, false]) {
    const wif = encodeWif(privHex, compressed);
    const res = decodeWif(wif);
    check('decodes', res.ok === true, res.ok ? '' : `${wif.slice(0, 12)}… -> ${res.reason}`);
    if (!res.ok) continue;
    check('compression flag survives', res.compressed === compressed);
    check('wif echoed verbatim', res.wif === wif);
    check('address matches re-derivation', res.address === address(publicKey(privHex, compressed)));
    // Cross-check the hand-rolled '04' + X + Y padding against elliptic itself.
    const fromElliptic = ec.keyFromPrivate(privHex).getPublic(compressed, 'hex');
    check('public key agrees with elliptic', publicKey(privHex, compressed) === fromElliptic,
      `${publicKey(privHex, compressed)} vs ${fromElliptic}`);
  }
}

console.log('compressed and uncompressed are different money');
for (const privHex of keys) {
  const c = decodeWif(encodeWif(privHex, true));
  const u = decodeWif(encodeWif(privHex, false));
  check('same key, two addresses', c.ok && u.ok && c.address !== u.address,
    c.ok && u.ok ? `both gave ${c.address}` : 'decode failed');
}

console.log('shapes: addresses start with L, compressed WIFs with T');
for (const privHex of keys) {
  const wif = encodeWif(privHex, true);
  const res = decodeWif(wif);
  check('compressed WIF starts with T', wif.startsWith('T'), wif.slice(0, 4));
  check('address starts with L', res.ok && res.address.startsWith('L'), res.ok ? res.address : res.reason);
  const un = decodeWif(encodeWif(privHex, false));
  check('uncompressed address starts with L', un.ok && un.address.startsWith('L'),
    un.ok ? un.address : un.reason);
}

console.log('every shape the fleet writes, and the address each one means');
/**
 * Swept across ~/Desktop/LanaDev on 2026-09-04: every app in the fleet writes
 * one of exactly two version bytes, 0xB0 or 0x41, and checks for exactly those
 * two. There is no third envelope. Compression decides the address, in this
 * module and in MejmoSeFajn alike — a compressed WIF means the compressed
 * address, an uncompressed one means the uncompressed address.
 */
const FORMS = [
  { label: 'T… 0xB0 compressed (lanapaper, MejmoSeFajn staking)', version: LANA_WIF_VERSION,      compressed: true,  first: 'T', length: 52 },
  { label: '6… 0xB0 uncompressed (MejmoSeFajn "Dominate")',       version: LANA_WIF_VERSION,      compressed: false, first: '6', length: 51 },
  { label: 'A… 0x41 compressed (100Million2Everyone)',            version: LANA_WIF_VERSION_100M, compressed: true,  first: 'A', length: 52 },
  { label: '3… 0x41 uncompressed (nothing writes this, but it decodes)',
                                                                  version: LANA_WIF_VERSION_100M, compressed: false, first: '3', length: 51 },
];
for (const privHex of keys.slice(0, 8)) {
  const want = {
    true: address(publicKey(privHex, true)),
    false: address(publicKey(privHex, false)),
  };
  for (const f of FORMS) {
    const wif = encodeWif(privHex, f.compressed, f.version);
    const res = decodeWif(wif);
    check(`${f.label}: accepted`, res.ok, res.ok ? '' : res.reason);
    check(`${f.label}: starts '${f.first}', ${f.length} chars`,
      wif[0] === f.first && wif.length === f.length, `'${wif[0]}', ${wif.length}`);
    check(`${f.label}: the address its compression means`,
      res.ok && res.address === want[String(f.compressed)],
      res.ok ? res.address : res.reason);
  }
  // The two compressed envelopes are the same wallet; the uncompressed ones are
  // a different address of the same secret.
  const t = decodeWif(encodeWif(privHex, true, LANA_WIF_VERSION));
  const a = decodeWif(encodeWif(privHex, true, LANA_WIF_VERSION_100M));
  const six = decodeWif(encodeWif(privHex, false, LANA_WIF_VERSION));
  check('T… and A… are the same wallet', t.address === a.address);
  check('6… is a different address of the same secret',
    six.address !== t.address && six.keyId === t.keyId);
}

console.log('a single mistyped character is always caught');
let corruptions = 0;
for (const privHex of keys.slice(0, 4)) {
  for (const compressed of [true, false]) {
    const wif = encodeWif(privHex, compressed);
    for (let i = 0; i < wif.length; i++) {
      for (const ch of ALPHABET) {
        if (ch === wif[i]) continue;
        const bad = wif.slice(0, i) + ch + wif.slice(i + 1);
        const res = decodeWif(bad);
        corruptions++;
        if (res.ok) {
          check('corruption rejected', false, `position ${i} -> '${ch}' still decoded`);
          i = wif.length;
          break;
        }
      }
    }
  }
}
check('every corruption rejected', true);
console.log(`  ${corruptions} corruptions tried, all rejected`);

console.log('a key from another chain is named as such');
for (const privHex of keys.slice(0, 6)) {
  for (const compressed of [true, false]) {
    const res = decodeWif(encodeWif(privHex, compressed, BITCOIN_WIF_VERSION));
    check('bitcoin WIF -> wrongNetwork', !res.ok && res.reason === 'wrongNetwork',
      res.ok ? 'accepted!' : res.reason);
  }
}
// A sound checksum is what makes "another chain" a claim worth making. Break it
// and the honest answer is that the key was mistyped, not that it belongs
// elsewhere — a typo landing on the first character must not be blamed on Bitcoin.
{
  const body = '80' + keys[0] + '01';
  const bad = base58Encode(Buffer.from(body + '00000000', 'hex'));
  const res = decodeWif(bad);
  check('broken checksum beats wrongNetwork', !res.ok && res.reason === 'checksum',
    res.ok ? 'accepted!' : res.reason);
}

console.log('a wallet from 100Million2Everyone is the same money in another envelope');
for (const privHex of keys.slice(0, 8)) {
  // Exactly what 100Million2Everyone/src/utils/walletGenerator.ts encodeWIF does.
  const m100 = decodeWif(encodeWif(privHex, true, LANA_WIF_VERSION_100M));
  const std = decodeWif(encodeWif(privHex, true, LANA_WIF_VERSION));
  check('0x41 wallet accepted', m100.ok, m100.ok ? '' : m100.reason);
  check('0x41 and 0xB0 give the same address', m100.ok && std.ok && m100.address === std.address,
    m100.ok && std.ok ? `${m100.address} vs ${std.address}` : 'one of them failed');
  // The duplicate check in the package compares keyId, so one key offered in both
  // envelopes has to look like one key.
  check('0x41 and 0xB0 share a keyId', m100.ok && std.ok && m100.keyId === std.keyId);
  check('0x41 wallets are 52 characters starting with A',
    m100.wif.length === 52 && m100.wif.startsWith('A'), `${m100.wif.length} chars, '${m100.wif[0]}'`);
  check('0xB0 wallets still start with T', std.wif.startsWith('T'));
}

console.log('the key fingerprint follows the secret, not the encoding');
for (const privHex of keys.slice(0, 8)) {
  const c = decodeWif(encodeWif(privHex, true));
  const u = decodeWif(encodeWif(privHex, false));
  check('both encodings decode', c.ok && u.ok);
  check('one key, one keyId', c.keyId === u.keyId, `${c.keyId} vs ${u.keyId}`);
  check('one key, two addresses', c.address !== u.address,
    'compressed and uncompressed collapsed to the same address');
}
{
  const seen = new Set(keys.map((k) => decodeWif(encodeWif(k, true)).keyId));
  check('different keys, different keyIds', seen.size === keys.length,
    `${seen.size} fingerprints for ${keys.length} keys`);
}

console.log('keys outside [1, n-1] are refused');
for (const privHex of ['0'.repeat(64), SECP256K1_N.toString(16), (SECP256K1_N + 1n).toString(16)]) {
  for (const compressed of [true, false]) {
    const res = decodeWif(encodeWif(privHex, compressed));
    check(`out-of-range key refused (${privHex.slice(0, 8)}…)`, !res.ok && res.reason === 'notAKey',
      res.ok ? 'accepted!' : res.reason);
  }
}

/** A WIF-shaped payload whose version byte is 0x00 — encodes with a leading '1'. */
const leadingZeroWif = (() => {
  const body = '00' + keys[0] + '01';
  return base58Encode(Buffer.from(body + doubleSha(body).substring(0, 8), 'hex'));
})();

console.log('lengths and the compression flag byte');
{
  const short = base58Encode(Buffer.from('b0' + keys[0].slice(0, 60), 'hex'));
  check('short payload -> notAKey', decodeWif(short).reason === 'notAKey');
  const body = 'b0' + keys[0] + '02';
  const flagged = base58Encode(Buffer.from(body + doubleSha(body).substring(0, 8), 'hex'));
  check('flag byte 0x02 -> notAKey', decodeWif(flagged).reason === 'notAKey');
  check('empty input -> notAKey', decodeWif('').reason === 'notAKey');
  check('non-base58 character -> notAKey', decodeWif('T0OIl').reason === 'notAKey');
  const truncated = encodeWif(keys[0], true).slice(0, -1);
  check('truncated WIF rejected', decodeWif(truncated).ok === false);
  // A version byte of 0x00 encodes as a leading '1', which carries no value —
  // only the decoder's leading-zero handling puts the byte back. Get that wrong
  // and the payload is 37 bytes instead of 38, so the answer turns into
  // 'checksum' rather than the honest 'wrongNetwork'. This pins it.
  check('leading zero byte survives base58 -> wrongNetwork',
    decodeWif(leadingZeroWif).reason === 'wrongNetwork', decodeWif(leadingZeroWif).reason);
  check('leading zero WIF really does start with 1', leadingZeroWif.startsWith('1'),
    leadingZeroWif.slice(0, 4));
}

console.log('what a scanner or a PDF paste drags along');
{
  const wif = encodeWif(keys[1], true);
  const messy = [
    ` ${wif} `,
    `${wif.slice(0, 10)}\n${wif.slice(10)}`,
    `${wif.slice(0, 8)} ${wif.slice(8)}`,
    `${wif.slice(0, 8)}\u200b${wif.slice(8)}`,
    `\ufeff${wif}\r\n`,
    `lanacoin:${wif}`,
    `lana:${wif}`,
    `lanacoin://${wif}`,
    `  lanacoin:${wif.slice(0, 12)}\n  ${wif.slice(12)}  `,
  ];
  for (const raw of messy) {
    const res = decodeWif(raw);
    check('noise stripped', res.ok && res.wif === wif, res.ok ? res.wif : res.reason);
  }
  check('normalize leaves base58 untouched', normalizeKeyInput(wif) === wif);
  check('normalize does not change case', normalizeKeyInput('TaBc') === 'TaBc');
}

console.log('random keys, for good measure');
for (let i = 0; i < 50; i++) {
  const privHex = randomBytes(32).toString('hex');
  const priv = BigInt('0x' + privHex);
  if (priv === 0n || priv >= SECP256K1_N) continue;
  const c = decodeWif(encodeWif(privHex, true));
  const u = decodeWif(encodeWif(privHex, false));
  check('random key round trip', c.ok && u.ok && c.address !== u.address
    && c.address.startsWith('L') && u.address.startsWith('L'));
}

console.log('the shipped src/lib/wif.ts agrees, case for case');
{
  /** Every input worth disagreeing about, in one list. */
  const corpus = [];
  for (const privHex of keys) {
    corpus.push(encodeWif(privHex, true), encodeWif(privHex, false));
    // Both envelopes, and one from another chain for contrast.
    corpus.push(encodeWif(privHex, true, LANA_WIF_VERSION_100M));
    corpus.push(encodeWif(privHex, false, LANA_WIF_VERSION_100M));
    corpus.push(encodeWif(privHex, true, BITCOIN_WIF_VERSION));
  }
  for (const privHex of ['0'.repeat(64), SECP256K1_N.toString(16), (SECP256K1_N + 1n).toString(16)]) {
    corpus.push(encodeWif(privHex, true), encodeWif(privHex, false));
  }
  {
    const wif = encodeWif(keys[1], true);
    corpus.push(
      '', 'T0OIl', wif.slice(0, -1), ` ${wif} `, `\ufeff${wif}\r\n`,
      `${wif.slice(0, 10)}\n${wif.slice(10)}`,
      `${wif.slice(0, 8)}\u200b${wif.slice(8)}`,
      `lanacoin:${wif}`, `lana://${wif}`,
      base58Encode(Buffer.from('b0' + keys[0].slice(0, 60), 'hex')),
      leadingZeroWif,
    );
    const flagged = 'b0' + keys[0] + '02';
    corpus.push(base58Encode(Buffer.from(flagged + doubleSha(flagged).substring(0, 8), 'hex')));
  }
  // Every single-character corruption of two real keys, so the corpus is
  // dominated by inputs that must be rejected for the right reason.
  for (const privHex of keys.slice(0, 2)) {
    for (const compressed of [true, false]) {
      const wif = encodeWif(privHex, compressed);
      for (let i = 0; i < wif.length; i++) {
        for (const ch of ALPHABET) {
          if (ch !== wif[i]) corpus.push(wif.slice(0, i) + ch + wif.slice(i + 1));
        }
      }
    }
  }

  let mismatch = null;
  for (const input of corpus) {
    const want = decodeWif(input);
    const got = await shipped.decodeWif(input);
    const same = want.ok === got.ok && (want.ok
      ? want.wif === got.wif && want.address === got.address && want.compressed === got.compressed
      : want.reason === got.reason);
    if (!same) {
      mismatch = `${JSON.stringify(input.slice(0, 20))} — reference ${JSON.stringify(want)} vs shipped ${JSON.stringify(got)}`;
      break;
    }
  }
  check('shipped decodeWif matches the reference on every input', mismatch === null, mismatch ?? '');
  console.log(`  ${corpus.length} inputs compared against the module the app loads`);

  for (const input of corpus.slice(0, 200)) {
    if (shipped.normalizeKeyInput(input) !== normalizeKeyInput(input)) {
      check('shipped normalizeKeyInput matches', false, JSON.stringify(input.slice(0, 20)));
      break;
    }
  }
  check('shipped normalizeKeyInput matches', true);
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  process.exit(1);
}
console.log('OK — the shipped decodeWif verified against an independent implementation');
