import { useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSelector } from '@/components/LanguageSelector';
import PackageWizard from '@/components/package/PackageWizard';
import { useLanguage } from '@/contexts/LanguageContext';
import { STR, packageLang, t } from '@/lib/packageStrings';

/**
 * The shell around the package wizard. It holds nothing itself — every private
 * key stays inside the wizard's own state — so leaving this page is enough to
 * forget them all.
 */
const PackagePage = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  // The app speaks three languages, the package speaks two; the bridge picks
  // the closest one it has.
  const lang = packageLang(language);

  /**
   * A ref, not state: the guard only has to be right at the instant the back
   * control is pressed, and keeping it out of state means a keystroke in the
   * wizard does not re-render this page.
   */
  const dirty = useRef(false);
  const onDirtyChange = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);

  /**
   * Twelve keys copied off twelve pieces of paper is half an hour of someone's
   * evening, so the way out asks first once anything has been typed.
   */
  const goHome = useCallback(() => {
    if (dirty.current && !window.confirm(t(STR.discardConfirm, lang))) return;
    navigate('/');
  }, [lang, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={goHome} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t(STR.packageBack, lang)}
          </Button>
          <div className="flex items-center gap-2 text-primary">
            <Package className="h-5 w-5" />
            <span className="text-sm font-medium">{t(STR.packageCardTitle, lang)}</span>
          </div>
          {/*
            The rest of the app puts this on the landing page and on /results.
            Without it here, anyone who opens /package directly — a bookmark, a
            reload, the link from a phone — is stuck in whatever language was
            last stored, with no way to change it.
          */}
          <div className="ml-auto">
            <LanguageSelector />
          </div>
        </div>

        <PackageWizard
          lang={lang}
          onExit={() => navigate('/')}
          onDirtyChange={onDirtyChange}
        />

        {/* Footer */}
        <footer className="pb-2 pt-12 text-center">
          <Link
            to="/docs"
            className="text-xs text-muted-foreground/60 transition-colors hover:text-primary"
          >
            Technical Documentation
          </Link>
        </footer>
      </div>
    </div>
  );
};

export default PackagePage;
