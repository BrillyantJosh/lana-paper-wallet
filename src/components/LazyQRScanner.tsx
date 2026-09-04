import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The camera scanner, fetched only when someone actually opens it.
 *
 * QRScanner carries jsqr — a whole QR decoder — and both places that offer a
 * Scan button render it conditionally, so nobody who does not press Scan ever
 * needs the code. Imported directly it landed in the entry bundle instead, and
 * every visitor to the landing page paid for a camera they never opened.
 *
 * Same props as QRScanner itself, so it is a drop-in replacement.
 */
const QRScanner = lazy(() => import('@/components/QRScanner'));

interface LazyQRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const LazyQRScanner = ({ onScan, onClose }: LazyQRScannerProps) => (
  <Suspense
    fallback={
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }
  >
    <QRScanner onScan={onScan} onClose={onClose} />
  </Suspense>
);

export default LazyQRScanner;
