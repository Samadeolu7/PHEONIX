import { useEffect, useRef } from 'react';

/**
 * Periodically re-invokes `callback` in the background so long-lived report
 * and dashboard views don't go stale while left open — several backend cron
 * jobs (reconciliation, interest posting, loan status, depreciation) mutate
 * the underlying data independently of any frontend action. Pauses while the
 * tab isn't visible and always calls the latest `callback` without resetting
 * the timer on every render.
 */
export function useAutoRefresh(callback: () => void, intervalMs: number, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
