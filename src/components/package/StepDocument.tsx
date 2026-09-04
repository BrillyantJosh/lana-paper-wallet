import { useState } from 'react';
import { AlertCircle, Download, Loader2, Printer, ShieldAlert } from 'lucide-react';
import { LANGS, Lang, STR, t } from '@/lib/packageStrings';
import { buildPackagePdf, packagePageCount, packagePdfFileName } from '@/lib/packagePdf';
import {
  PackageDraft,
  WALLET_KINDS,
  WalletEntry,
  totalWallets,
} from '@/lib/walletKinds';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface StepDocumentProps {
  lang: Lang;
  draft: PackageDraft;
  entries: WalletEntry[];
  onBack: () => void;
  onStartOver: () => void;
}

const StepDocument = ({ lang, draft, entries, onBack, onStartOver }: StepDocumentProps) => {
  const [building, setBuilding] = useState(false);
  const [failed, setFailed] = useState(false);

  const total = totalWallets(draft.counts);
  const pages = packagePageCount(entries);

  const handleDownload = async () => {
    setBuilding(true);
    setFailed(false);
    try {
      const blob = await buildPackagePdf({ draft, entries, issuedOn: new Date() });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = packagePdfFileName(draft);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The blob holds every private key in the package, so it must not outlive
      // the download — but revoking on the next tick is too soon: Firefox has
      // often not taken the blob yet and cancels the save with no error, so the
      // screen reports success and there is no file. A minute is long enough
      // for the browser and short enough that the keys do not linger.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setFailed(true);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{t(STR.step3Heading, lang)}</h2>
        <p className="text-sm text-muted-foreground">{t(STR.step3Intro, lang)}</p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-xs text-muted-foreground">{t(STR.fullNameLabel, lang)}</p>
            <p className="text-lg font-semibold text-card-foreground">{draft.fullName}</p>
          </div>

          {draft.description.trim() !== '' && (
            <div>
              <p className="text-xs text-muted-foreground">{t(STR.descriptionLabel, lang)}</p>
              <p className="text-sm text-card-foreground">{draft.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground">{t(STR.pdfCoverContents, lang)}</p>
            <ul className="mt-1 space-y-1">
              {WALLET_KINDS.map((kind) => {
                const count = draft.counts[kind.id] ?? 0;
                if (count === 0) return null;
                return (
                  <li
                    key={kind.id}
                    className="flex items-baseline justify-between gap-3 text-sm text-card-foreground"
                  >
                    <span className="min-w-0">{t(kind.name, lang)}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{'× '}{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <Separator />

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-card-foreground">
              {t(STR.walletsInPackage(total), lang)}
            </span>
            <span className="text-muted-foreground">{t(STR.pdfPages(pages), lang)}</span>
            {/* Worth repeating here: the paper's language was chosen two steps ago. */}
            <span className="text-muted-foreground">
              {t(STR.docLangLabel, lang)}:{' '}
              {LANGS.find((l) => l.id === draft.docLang)?.label ?? draft.docLang}
            </span>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <Alert>
          <Printer className="h-4 w-4" />
          <AlertDescription>{t(STR.printHint, lang)}</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{t(STR.keySafety, lang)}</AlertDescription>
        </Alert>
        <p className="text-xs text-muted-foreground">{t(STR.localOnly, lang)}</p>
      </section>

      <div className="space-y-3">
        <Button
          type="button"
          variant="hero"
          size="lg"
          onClick={handleDownload}
          disabled={building}
          className="w-full"
        >
          {building ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t(building ? STR.buildingPdf : STR.downloadPdf, lang)}
        </Button>

        {failed && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t(STR.pdfFailed, lang)}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            {t(STR.back, lang)}
          </Button>
          <Button type="button" variant="ghost" onClick={onStartOver}>
            {t(STR.startOver, lang)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StepDocument;
