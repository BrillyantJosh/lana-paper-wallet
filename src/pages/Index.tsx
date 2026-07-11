import { Link } from 'react-router-dom';
import WalletConverter from '@/components/WalletConverter';
import headerImage from '@/assets/lana-header.png';
import { Button } from '@/components/ui/button';
import { Wallet, Printer } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const Index = () => {
  const { t } = useLanguage();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="relative w-full h-[400px] md:h-[500px] lg:h-[600px] overflow-hidden">
        <img 
          src={headerImage} 
          alt="LANA Paper Wallet" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />
        
        {/* Top Right Buttons */}
        <div className="absolute top-6 right-6 z-10 flex gap-2">
          <Button
            variant="hero"
            size="lg"
            asChild
          >
            <a
              href="https://print.lanapaper.online"
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <Printer className="h-5 w-5" />
              Bulk Print
            </a>
          </Button>
          <Button
            variant="hero"
            size="lg"
            asChild
          >
            <a
              href="https://www.offlinelana.org"
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <Wallet className="h-5 w-5" />
              {t.createWallet}
            </a>
          </Button>
        </div>
        
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] text-center px-4">
            LANA Paper Wallet
          </h1>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <WalletConverter />
      </div>

      {/* Footer */}
      <footer className="text-center pb-6">
        <Link
          to="/docs"
          className="text-xs text-muted-foreground/60 hover:text-primary transition-colors"
        >
          Technical Documentation
        </Link>
      </footer>
    </div>
  );
};

export default Index;
