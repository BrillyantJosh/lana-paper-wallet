import { AlertCircle, Check, Minus, Plus } from 'lucide-react';
import { Bilingual, Lang, STR, t } from '@/lib/packageStrings';
import {
  MAX_WALLETS_PER_PACKAGE,
  PackageDraft,
  WALLET_KINDS,
  WalletKind,
  totalWallets,
} from '@/lib/walletKinds';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * The printed page holds a two-line description; past roughly this many
 * characters it would be silently truncated on paper, so the field stops here
 * instead and says how much room is left.
 */
const DESCRIPTION_MAX = 140;

interface StepComposeProps {
  lang: Lang;
  draft: PackageDraft;
  onChange: (draft: PackageDraft) => void;
  onNext: () => void;
  onExit: () => void;
}

/** How this kind may be counted — read from the kind, never assumed. */
function countRule(kind: WalletKind): Bilingual {
  if (kind.fixedCount && kind.fixedCount > 1) return STR.fixedSet;
  if (kind.maxCount === 1) return STR.onlyOne;
  return STR.severalAllowed;
}

const StepCompose = ({ lang, draft, onChange, onNext, onExit }: StepComposeProps) => {
  const total = totalWallets(draft.counts);
  const roomLeft = MAX_WALLETS_PER_PACKAGE - total;

  const setCount = (kind: WalletKind, next: number) => {
    const counts = { ...draft.counts };
    if (next <= 0) delete counts[kind.id];
    else counts[kind.id] = next;
    onChange({ ...draft, counts });
  };

  const blocker: Bilingual | null = !draft.fullName.trim()
    ? STR.fullNameMissing
    : total === 0
      ? STR.packageEmpty
      : total > MAX_WALLETS_PER_PACKAGE
        ? STR.packageTooBig(MAX_WALLETS_PER_PACKAGE)
        : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{t(STR.step1Heading, lang)}</h2>
        <p className="text-sm text-muted-foreground">{t(STR.step1Intro, lang)}</p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="package-full-name">{t(STR.fullNameLabel, lang)}</Label>
            <Input
              id="package-full-name"
              type="text"
              value={draft.fullName}
              onChange={(e) => onChange({ ...draft, fullName: e.target.value })}
              placeholder={t(STR.fullNamePlaceholder, lang)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="package-description">
              {t(STR.descriptionLabel, lang)}{' '}
              <span className="font-normal text-muted-foreground">
                ({t(STR.descriptionOptional, lang)})
              </span>
            </Label>
            <Textarea
              id="package-description"
              rows={2}
              value={draft.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder={t(STR.descriptionPlaceholder, lang)}
              autoComplete="off"
              className="resize-none"
            />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t(STR.descriptionHint, lang)}</p>
              <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
                {draft.description.length} / {DESCRIPTION_MAX}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">{t(STR.chooseWallets, lang)}</h3>
          <p className="text-sm text-muted-foreground">{t(STR.chooseWalletsHint, lang)}</p>
        </div>

        <div className="space-y-3">
          {WALLET_KINDS.map((kind) => {
            const count = draft.counts[kind.id] ?? 0;
            const included = count > 0;
            // A fixed-size kind is included or not; only an open kind gets a counter.
            const isSet = kind.fixedCount !== undefined || kind.maxCount === 1;
            const setSize = kind.fixedCount ?? kind.minCount;
            const canInclude = roomLeft >= setSize;
            const canAddOne = count < kind.maxCount && roomLeft >= 1;

            return (
              <Card key={kind.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <img
                    src={kind.thumbUrl}
                    alt=""
                    className="h-28 w-20 shrink-0 self-start rounded-md border border-border object-cover"
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-card-foreground">{t(kind.name, lang)}</p>
                      {included && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          {t(STR.included, lang)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{t(kind.tagline, lang)}</p>
                    <p className="text-xs text-muted-foreground/70">{t(countRule(kind), lang)}</p>
                    {!included && (
                      <p className="text-xs text-muted-foreground/70">{t(STR.notIncluded, lang)}</p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isSet ? (
                      <Button
                        type="button"
                        variant={included ? 'outline' : 'default'}
                        onClick={() => setCount(kind, included ? 0 : setSize)}
                        disabled={!included && !canInclude}
                      >
                        {t(included ? STR.remove : STR.add, lang)}
                      </Button>
                    ) : included ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setCount(kind, count - 1 < kind.minCount ? 0 : count - 1)}
                          aria-label={t(STR.removeOne, lang)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span
                          aria-label={t(STR.countLabel, lang)}
                          className="min-w-[2.5rem] text-center font-mono text-lg font-semibold text-card-foreground"
                        >
                          {count}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setCount(kind, count + 1)}
                          disabled={!canAddOne}
                          aria-label={t(STR.addOne, lang)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => setCount(kind, kind.minCount)}
                        disabled={!canInclude}
                      >
                        {t(STR.add, lang)}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-sm font-medium text-foreground">
          {t(STR.walletsInPackage(total), lang)}
        </p>
        {roomLeft <= 0 && (
          <p className="text-sm text-muted-foreground">
            {t(STR.packageTooBig(MAX_WALLETS_PER_PACKAGE), lang)}
          </p>
        )}
      </section>

      <div className="space-y-3">
        {blocker && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t(blocker, lang)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onExit}>
            {t(STR.backToStart, lang)}
          </Button>
          <Button type="button" onClick={onNext} disabled={blocker !== null} className="px-6">
            {t(STR.next, lang)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StepCompose;
