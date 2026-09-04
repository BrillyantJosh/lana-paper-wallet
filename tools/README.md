# tools

Small pure-Node utilities. None of them run in the app; they exist so the
numbers baked into `src/lib/walletKinds.ts` and the assets under `public/` can
be re-derived instead of guessed at. They came over from `lana-paper-print`
together with the Complete Package feature itself.

| tool | what it does |
|---|---|
| `verify-wif.mjs` | Re-implements LanaCoin WIF decoding independently and replays a large corpus through both it and the shipped `src/lib/wif.ts`, demanding field-for-field agreement. `npm run verify:wif`. |
| `verify-pdf-qr.mjs` | Reads the QR codes back off rendered pages of an exported PDF with the same `jsqr` the scanner uses, and checks each one against the key printed beside it. See below. |
| `prep-ornament.mjs` | Converts a generated ornament to 8-bit greyscale and lifts the paper to pure white, so a printer only lays down ink where the engraving is. Also what makes the PNGs compress. |
| `find-content-box.mjs` | Finds the largest all-white rectangle in an ornament — the `contentBox` values in `walletKinds.ts`. Optional bounds restrict the search to a region, which is how the cover's oval cartouche was measured. |
| `find-white-box.mjs` | The older single-band version of the same search, kept because it is simpler to reason about when an ornament has one obvious clear band. Nothing in this repo depends on its output. |
| `lana-logo-source.png` | The brand emblem `public/lana-mark.png` was derived from: flattened onto white, forced to solid black ink and trimmed. |

## Replacing an ornament

Generate a sheet with one complete mandala in the upper half and one small motif
near the bottom, both entire and touching no edge, then:

```
sips -Z 3000 --matchTo "/System/Library/ColorSync/Profiles/Generic Gray Profile.icc" \
     sheet.png --out /tmp/sheet-grey.png
node tools/split-ornament.mjs /tmp/sheet-grey.png /tmp/out <id> 0.02 234
sips --resampleWidth 1100 /tmp/out/<id>-crown.png  --out public/ornaments/<id>-crown.png
sips --resampleWidth 420  /tmp/out/<id>-footer.png --out public/ornaments/<id>-footer.png
sips --resampleWidth 320 -s format jpeg -s formatOptions 82 \
     /tmp/out/<id>-crown.png --out src/assets/thumbs/<id>.jpg
```

Paste the printed aspect ratios into that kind's entry in `walletKinds.ts` — they
are what lets the piece be drawn to a fixed height without distortion. The fourth
argument ignores that fraction of each edge, for sheets rendered as a photograph
of a piece of paper; the fifth is the brightness at which paper starts, and 234
is firm enough to clear an off-white background.

The PDF's own dev-mode guard warns if anything is later drawn outside the
writing area.

## Checking an exported package end to end

This is the one that matters: a paper wallet whose code does not match its own
ink is money that cannot be recovered. It needs a PDF exported from the running
app, its pages rendered to `page-NN.png`, and a JSON list of what each page was
supposed to carry — `[{ page, kind, position, address, wif }]`.

```
node tools/verify-pdf-qr.mjs <pagesDir> <expected.json>
```

Its two crop windows are hard-coded to where `drawWalletPage` puts the codes. If
you move them, move these too, or every page reports a mismatch.

## Checking the key rules

```
npm run verify:wif     # or: node tools/verify-wif.mjs
npm test               # typecheck, then the same corpus
```

`verify-wif.mjs` imports `src/lib/wif.ts` directly, so that it checks the module
the app actually ships rather than a copy of its rules. Two things follow from
that:

- **Node 22.18 or newer.** It needs `module.registerHooks` and TypeScript type
  stripping. Node 20 has neither, which is why `.github/workflows/deploy.yml`
  pins Node 24.
- **The import graph has to load outside Vite.** Its resolve hook teaches Node
  the two things this app's TypeScript assumes a bundler will do: extensionless
  imports, and the `@/…` alias that `vite.config.ts` maps to `./src`. Both are
  scoped to files under this repo's `src/`, so nothing in `node_modules`
  resolves differently because of it. `src/lib/wif.ts` therefore pulls in
  `src/lib/crypto.ts` for real, and the shipped decoder is the one under test.

It is meant to be able to fail. Change a version byte in `src/lib/crypto.ts` and
it reports the exact input the shipped module and the reference disagreed on,
then exits non-zero.
