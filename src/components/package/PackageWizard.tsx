import { useCallback, useEffect, useState } from 'react';
import { Lang, STR, t } from '@/lib/packageStrings';
import { PackageDraft, WalletEntry, buildEntries } from '@/lib/walletKinds';
import { Progress } from '@/components/ui/progress';
import StepCompose from './StepCompose';
import StepKeys from './StepKeys';
import StepDocument from './StepDocument';

interface PackageWizardProps {
  lang: Lang;
  onExit: () => void;
  /**
   * Raised whenever the flow starts or stops holding something a person would
   * hate to retype, so the shell around it can ask before throwing it away.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

const TOTAL_STEPS = 3;
const STEP_NAMES = [STR.step1Name, STR.step2Name, STR.step3Name];

const emptyDraft = (): PackageDraft => ({ fullName: '', description: '', counts: {} });

/**
 * Owns the whole flow. Every private key the person types lives in this
 * component's state and nowhere else — no storage, no URL, no logging — so
 * leaving the wizard or starting over is enough to forget all of them.
 */
const PackageWizard = ({ lang, onExit, onDirtyChange }: PackageWizardProps) => {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<PackageDraft>(emptyDraft);
  const [entries, setEntries] = useState<WalletEntry[]>([]);

  const dirty =
    draft.fullName.trim() !== '' ||
    draft.description.trim() !== '' ||
    entries.some((entry) => entry.input !== '');

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const reset = useCallback(() => {
    setEntries([]);
    setDraft(emptyDraft());
    setStep(1);
  }, []);

  const handleExit = useCallback(() => {
    reset();
    onExit();
  }, [onExit, reset]);

  /**
   * Keys already entered survive a trip back to step 1, but only for wallets
   * that are still in the package — a removed row takes its key with it.
   */
  const openKeys = useCallback(() => {
    setEntries((previous) => {
      const kept = new Map(previous.map((entry) => [entry.uid, entry]));
      return buildEntries(draft.counts).map((fresh) => kept.get(fresh.uid) ?? fresh);
    });
    setStep(2);
  }, [draft.counts]);

  const patchEntry = useCallback((uid: string, patch: Partial<WalletEntry>) => {
    setEntries((previous) =>
      previous.map((entry) => (entry.uid === uid ? { ...entry, ...patch } : entry)),
    );
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label={t(STR.stepOf(step, TOTAL_STEPS), lang)} className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t(STR.stepOf(step, TOTAL_STEPS), lang)}
        </p>
        <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {STEP_NAMES.map((name, index) => {
            const number = index + 1;
            return (
              <li key={number} className="flex items-center gap-2">
                {number > 1 && <span aria-hidden="true" className="text-muted-foreground/40">/</span>}
                <span
                  aria-current={number === step ? 'step' : undefined}
                  className={
                    number === step
                      ? 'text-sm font-semibold text-foreground'
                      : number < step
                        ? 'text-sm text-muted-foreground'
                        : 'text-sm text-muted-foreground/50'
                  }
                >
                  {t(name, lang)}
                </span>
              </li>
            );
          })}
        </ol>
        <Progress value={(step / TOTAL_STEPS) * 100} className="mt-3 h-1.5" />
      </nav>

      {step === 1 && (
        <StepCompose
          lang={lang}
          draft={draft}
          onChange={setDraft}
          onNext={openKeys}
          onExit={handleExit}
        />
      )}

      {step === 2 && (
        <StepKeys
          lang={lang}
          entries={entries}
          onEntryChange={patchEntry}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepDocument
          lang={lang}
          draft={draft}
          entries={entries}
          onBack={() => setStep(2)}
          onStartOver={reset}
        />
      )}
    </div>
  );
};

export default PackageWizard;
