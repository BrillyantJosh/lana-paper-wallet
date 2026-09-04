import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, QrCode, ShieldCheck } from 'lucide-react';
import QRScanner from '@/components/LazyQRScanner';
import { Bilingual, Lang, STR, t } from '@/lib/packageStrings';
import { WifError, decodeWif, normalizeKeyInput } from '@/lib/wif';
import { prefetchPackageAssets } from '@/lib/packagePdf';
import { WALLET_KINDS, WalletEntry, WalletKindId, walletKind } from '@/lib/walletKinds';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

const REASONS: Record<WifError, Bilingual> = {
  notAKey: STR.errNotAKey,
  wrongNetwork: STR.errWrongNetwork,
  checksum: STR.errChecksum,
};

interface StepKeysProps {
  lang: Lang;
  entries: WalletEntry[];
  onEntryChange: (uid: string, patch: Partial<WalletEntry>) => void;
  onBack: () => void;
  onNext: () => void;
}

const StepKeys = ({ lang, entries, onEntryChange, onBack, onNext }: StepKeysProps) => {
  const [scanUid, setScanUid] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<Bilingual | null>(null);
  /** Bumped to remount the scanner after it refuses a scan and stops itself. */
  const [scanAttempt, setScanAttempt] = useState(0);

  // The document needs about seven megabytes of engraving and font. Fetching it
  // while the keys are still being typed turns the wait on the next screen from
  // twenty seconds into none.
  useEffect(() => {
    prefetchPackageAssets([...new Set(entries.map((entry) => entry.kind))]);
    // Deliberately once per visit to this step: the kinds cannot change here,
    // and loadAsset already de-duplicates anything asked for twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One counter per row. Deriving an address is asynchronous, so a slow result
   * from an earlier keystroke must be dropped rather than allowed to land on
   * top of a later one.
   */
  const sequence = useRef<Record<string, number>>({});

  const handleInput = useCallback((uid: string, raw: string) => {
    const seq = (sequence.current[uid] ?? 0) + 1;
    sequence.current[uid] = seq;

    onEntryChange(uid, { input: raw, wif: null, address: null, keyId: null, error: null });

    const normalized = normalizeKeyInput(raw);
    if (!normalized) return;

    void decodeWif(normalized).then((result) => {
      if (sequence.current[uid] !== seq) return;
      // Compared against the literal, not by truthiness: this repo builds with
      // strictNullChecks off, where `if (result.ok)` does not narrow the union.
      if (result.ok === false) {
        onEntryChange(uid, { wif: null, address: null, keyId: null, error: REASONS[result.reason] });
        return;
      }
      onEntryChange(uid, {
        wif: result.wif,
        address: result.address,
        keyId: result.keyId,
        error: null,
      });
    }).catch(() => {
      // decodeWif reaches crypto.subtle, which the browser withholds on an
      // insecure origin — exactly the setup this screen invites, a laptop
      // running the site on the LAN and a phone at http://192.168.x.x. Without
      // this the row would just sit there: no address, no error, no way on.
      if (sequence.current[uid] !== seq) return;
      onEntryChange(uid, { wif: null, address: null, keyId: null, error: STR.errNoCrypto });
    });
  }, [onEntryChange]);

  /**
   * The scan check needs the current rows, but reading `entries` inside the
   * callback would change its identity on every keystroke — and QRScanner
   * restarts its camera whenever that happens. A ref keeps the callback stable.
   */
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  /** How a row is named when a message has to point at it. */
  const rowLabel = useCallback(
    (entry: WalletEntry) => {
      const kind = walletKind(entry.kind);
      const siblings = entriesRef.current.filter((e) => e.kind === entry.kind).length;
      const name = t(kind.name, lang);
      return siblings > 1 ? `${name} ${t(STR.pdfPositionOf(entry.position, siblings), lang)}` : name;
    },
    [lang],
  );

  const closeScanner = useCallback(() => {
    setScanUid(null);
    setScanNotice(null);
  }, []);

  /**
   * QRScanner restarts its camera whenever this callback changes identity, so a
   * fresh inline arrow would tear the stream down and ask for it again on every
   * keystroke in any other row — and a getUserMedia still in flight when that
   * happens outlives its own cleanup, leaving the camera light on.
   */
  const handleScan = useCallback(
    async (text: string) => {
      if (scanUid === null) return;

      // Scanning the same wallet twice is the easy mistake: eight pieces of
      // paper on a table, one gets read again instead of the next. Rather than
      // accept it and complain further down a long page — where the scanner has
      // already closed and the row may be out of sight — refuse it here, name
      // the wallet that already holds it, and keep the camera looking.
      try {
        const result = await decodeWif(normalizeKeyInput(text));
        if (result.ok !== false) {
          const clash = entriesRef.current.find(
            (e) => e.uid !== scanUid && e.keyId === result.keyId,
          );
          if (clash) {
            setScanNotice(STR.scanDuplicateAt(rowLabel(clash)));
            // The scanner stops itself after one decode, so it has to be
            // remounted to look again.
            setScanAttempt((n) => n + 1);
            return;
          }
        }
      } catch {
        // Whatever went wrong deciding, handleInput will reach the same code
        // and report it on the row. Never swallow the scan over it.
      }

      handleInput(scanUid, text);
      setScanUid(null);
      setScanNotice(null);
    },
    [scanUid, handleInput, rowLabel],
  );

  /**
   * Two rows collide when they hold the same SECRET, not when the typed text or
   * the derived address matches. The compressed and uncompressed encodings of
   * one key derive two different addresses while spending the same coins, so
   * comparing addresses would wave that pair through — two sheets that look
   * like two wallets, either of which empties the other.
   */
  const duplicates = useMemo(() => {
    const firstSeenAt = new Map<string, WalletEntry>();
    const clashing = new Map<string, WalletEntry>();
    for (const entry of entries) {
      if (!entry.keyId) continue;
      const first = firstSeenAt.get(entry.keyId);
      if (first === undefined) firstSeenAt.set(entry.keyId, entry);
      else clashing.set(entry.uid, first);
    }
    return clashing;
  }, [entries]);

  const perKind = useMemo(() => {
    const counts = new Map<WalletKindId, number>();
    for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    return counts;
  }, [entries]);

  const done = entries.filter((e) => e.address !== null && !duplicates.has(e.uid)).length;
  const missing = entries.length - done;
  // A duplicate counts as unfilled, but "one key still missing" is the wrong
  // thing to say about a row that is full of the wrong key.
  const duplicateCount = duplicates.size;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{t(STR.step2Heading, lang)}</h2>
        <p className="text-sm text-muted-foreground">{t(STR.step2Intro, lang)}</p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{t(STR.localOnly, lang)}</span>
        </p>
      </header>

      <div className="space-y-6">
        {WALLET_KINDS.map((kind) => {
          const rows = entries.filter((entry) => entry.kind === kind.id);
          if (rows.length === 0) return null;
          const perKindCount = perKind.get(kind.id) ?? 0;

          return (
            <section key={kind.id} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t(kind.name, lang)}
              </h3>

              {rows.map((entry) => {
                const inputId = `key-${entry.uid}`;
                const clashesWith = duplicates.get(entry.uid);
                const isDuplicate = clashesWith !== undefined;
                const problem: Bilingual | null = clashesWith
                  ? STR.errDuplicateAt(rowLabel(clashesWith))
                  : entry.error;
                const filled = entry.address !== null && !isDuplicate;

                return (
                  <Card key={entry.uid}>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-card-foreground">
                          {t(walletKind(entry.kind).name, lang)}
                        </span>
                        {perKindCount > 1 && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {t(STR.pdfPositionOf(entry.position, perKindCount), lang)}
                          </span>
                        )}
                      </div>

                      <Label htmlFor={inputId} className="mt-3 block text-xs text-muted-foreground">
                        {t(STR.keyLabel, lang)}
                      </Label>
                      <div className="mt-1.5 flex gap-2">
                        <Input
                          id={inputId}
                          type="text"
                          value={entry.input}
                          onChange={(e) => handleInput(entry.uid, e.target.value)}
                          placeholder={t(STR.keyPlaceholder, lang)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="min-w-0 flex-1 font-mono"
                        />
                        {/*
                          While the camera is open every other row's Scan is dead: a stray
                          Tab-Tab-Enter behind the overlay would otherwise re-point the running
                          scanner at a different row than the one it was opened for.
                        */}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setScanNotice(null);
                            setScanUid(entry.uid);
                          }}
                          disabled={scanUid !== null}
                          className="shrink-0 px-3"
                        >
                          <QrCode className="h-4 w-4" />
                          <span className="hidden sm:inline">{t(STR.scan, lang)}</span>
                        </Button>
                      </div>

                      {filled && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground">
                            {t(STR.addressLabel, lang)}
                          </p>
                          <p className="mt-0.5 flex items-start gap-1.5 font-mono text-sm text-foreground">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 break-all">{entry.address}</span>
                          </p>
                        </div>
                      )}

                      {problem && (
                        <Alert variant="destructive" className="mt-3">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{t(problem, lang)}</AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">
            {t(STR.progressFilled(done, entries.length), lang)}
          </p>
          <Progress
            value={entries.length === 0 ? 0 : (done / entries.length) * 100}
            className="h-1.5"
          />
          <p className="text-sm text-muted-foreground">
            {t(
              duplicateCount > 0
                ? STR.stillDuplicate(duplicateCount)
                : missing === 0
                  ? STR.allFilled
                  : STR.stillMissing(missing),
              lang,
            )}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            {t(STR.back, lang)}
          </Button>
          <Button
            type="button"
            onClick={onNext}
            disabled={missing > 0 || entries.length === 0}
            className="px-6"
          >
            {t(STR.next, lang)}
          </Button>
        </div>
      </div>

      {scanUid !== null && (
        <QRScanner
          key={`${scanUid}:${scanAttempt}`}
          onScan={handleScan}
          onClose={closeScanner}
          notice={scanNotice ? t(scanNotice, lang) : undefined}
        />
      )}
    </div>
  );
};

export default StepKeys;
