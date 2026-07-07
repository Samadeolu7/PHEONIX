import { useEffect, useState } from 'react';
import { Landmark, AlertTriangle } from 'lucide-react';

/**
 * Wait-state UI for the synchronous statement-reconciliation upload, which
 * can take up to ~90 seconds while Bank-Recon computes matches. A bare
 * spinner with no feedback reads as broken well before that ceiling, so
 * this shows a live elapsed-time counter, staged status copy, and an
 * explicit "don't close this tab" warning.
 */

const STAGE_MESSAGES: { afterSeconds: number; message: string }[] = [
  { afterSeconds: 0, message: 'Uploading and parsing your statement…' },
  { afterSeconds: 4, message: 'Matching bank transactions against ERP records…' },
  { afterSeconds: 20, message: 'Still working — larger statements take a little longer…' },
  { afterSeconds: 45, message: 'This is taking longer than usual, but still running…' },
];

function currentMessage(elapsedSeconds: number): string {
  let message = STAGE_MESSAGES[0].message;
  for (const stage of STAGE_MESSAGES) {
    if (elapsedSeconds >= stage.afterSeconds) {
      message = stage.message;
    }
  }
  return message;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function ReconciliationWaitState() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-10">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        {/* Layered ring spinner: two rings spinning at different speeds/
            directions read as far more "alive" than a single border-spin div */}
        <div className="relative w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-600 animate-spin"
            style={{ animationDuration: '1.1s' }}
          />
          <div
            className="absolute inset-2 rounded-full border-4 border-transparent border-b-blue-300 animate-spin"
            style={{ animationDuration: '1.7s', animationDirection: 'reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Landmark className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-1">Reconciling your statement</h3>
        <p className="text-sm text-gray-600 mb-4 min-h-[1.25rem]">{currentMessage(elapsed)}</p>

        <div className="text-3xl font-mono font-semibold text-blue-600 tabular-nums mb-6" aria-live="polite">
          {formatElapsed(elapsed)}
        </div>

        <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2 text-left">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            Please don't close this tab or navigate away — matching can take up to about a
            minute for larger statements.
          </p>
        </div>
      </div>
    </div>
  );
}
