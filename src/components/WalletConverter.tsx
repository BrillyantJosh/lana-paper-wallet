import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet, Hash, CheckCircle2, AlertCircle, ScanLine, Info, Plus } from 'lucide-react';
import { convertWifToIds, isValidWifFormat, normalizePrivateKey, generateNewWallet } from '@/lib/crypto';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import QRScanner from '@/components/LazyQRScanner';

const WalletConverter = () => {
  const navigate = useNavigate();
  const [wifInput, setWifInput] = React.useState('');
  const [isConverting, setIsConverting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [isValidInput, setIsValidInput] = React.useState<boolean | null>(null);
  const [showQRScanner, setShowQRScanner] = React.useState(false);
  const [showNostrData, setShowNostrData] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleConvert = async () => {
    const cleanWif = normalizePrivateKey(wifInput);
    
    if (!cleanWif) {
      setError(t.errors.enterWif);
      return;
    }

    setIsConverting(true);
    setError('');

    try {
      const result = await convertWifToIds(cleanWif);
      
      if (!result || !result.walletId) {
        throw new Error('Invalid conversion result');
      }
      
      toast({
        title: t.toasts.conversionSuccess,
        description: t.toasts.conversionSuccessDesc,
      });

      // Navigate to results page with data
      navigate('/results', {
        state: {
          result,
          wifInput: cleanWif,
          showNostrData,
        }
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Conversion failed';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: t.toasts.conversionFailed,
        description: errorMessage,
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handleQRScan = (data: string) => {
    setWifInput(data);
    setShowQRScanner(false);
    toast({
      title: t.toasts.qrScanned,
      description: t.toasts.qrScannedDesc,
    });
  };

  const handleGenerateWallet = async () => {
    setIsGenerating(true);
    setError('');
    try {
      const { wif } = await generateNewWallet();
      setWifInput(wif);
      toast({
        title: t.toasts.walletGenerated,
        description: t.toasts.walletGeneratedDesc,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  // Validate WIF input async
  React.useEffect(() => {
    const validateInput = async () => {
      const cleanWif = normalizePrivateKey(wifInput);
      
      if (!cleanWif) {
        setIsValidInput(null);
        return;
      }
      
      try {
        const valid = await isValidWifFormat(cleanWif);
        setIsValidInput(valid);
      } catch {
        setIsValidInput(false);
      }
    };

    const timeoutId = setTimeout(validateInput, 300);
    return () => clearTimeout(timeoutId);
  }, [wifInput]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Language Selector */}
      <div className="flex justify-end">
        <LanguageSelector />
      </div>

      {/* Instructions */}
      <Card className="bg-gradient-card border-border shadow-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Info className="h-5 w-5" />
            {t.instructions.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t.instructions.text1}</p>
          <p>{t.instructions.text2}</p>
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card className="bg-gradient-card border-border shadow-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {t.input.title}
          </CardTitle>
          <CardDescription>
            {t.input.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wif-input">{t.input.label}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="wif-input"
                  type="text"
                  placeholder={t.input.placeholder}
                  value={wifInput}
                  onChange={(e) => setWifInput(e.target.value)}
                  className={`pr-12 ${
                    isValidInput === false ? 'border-destructive' : 
                    isValidInput === true ? 'border-success' : 'border-input'
                  }`}
                />
                {isValidInput !== null && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isValidInput ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowQRScanner(true)}
                title={t.input.scanButton}
              >
                <ScanLine className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerateWallet}
                disabled={isGenerating}
                title={t.input.generateButton}
              >
                <Plus className="h-4 w-4" />
                {t.input.generateButton}
              </Button>
            </div>
            {isValidInput === false && (
              <p className="text-sm text-destructive">
                {t.input.invalidFormat}
              </p>
            )}
          </div>

          <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="show-nostr"
                checked={showNostrData}
                onChange={(e) => setShowNostrData(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
              />
              <div className="flex-1 space-y-1">
                <Label 
                  htmlFor="show-nostr" 
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  {t.input.showNostr}
                </Label>
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>
                    {t.input.nostrInfo}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleConvert}
            disabled={isConverting || !isValidInput}
            variant="hero"
            size="lg"
            className="w-full"
          >
            {isConverting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                {t.input.converting}
              </>
            ) : (
              <>
                <Hash className="h-4 w-4" />
                {t.input.convertButton}
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <>
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setShowQRScanner(false)}
          />
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowQRScanner(false)}
          />
        </>
      )}
    </div>
  );
};

export default WalletConverter;
