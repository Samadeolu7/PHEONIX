import * as React from 'react';

import { ENV_LABEL, bannerText, isNonProductionBuild } from './envLabel';

/**
 * A thin bar pinned to the top of every page, in both the staff app and the
 * customer portal (rendered from main.tsx above either app). It ignores the
 * mouse so it never blocks a button underneath it.
 */
export function StagingBanner({ label = ENV_LABEL }: { label?: string }) {
  React.useEffect(() => {
    if (!isNonProductionBuild(label)) return;
    const prefix = `[${label.toUpperCase()}] `;
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    // Apps set their own titles later; keep the prefix on.
    const titleEl = document.querySelector('title');
    if (!titleEl) return;
    const observer = new MutationObserver(apply);
    observer.observe(titleEl, { childList: true });
    return () => observer.disconnect();
  }, [label]);

  if (!isNonProductionBuild(label)) return null;
  return (
    <div
      role="status"
      aria-label={`${label} environment`}
      data-testid="staging-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
        padding: '2px 12px',
        textAlign: 'center',
        font: '600 12px/16px system-ui, -apple-system, Segoe UI, sans-serif',
        letterSpacing: '0.03em',
        color: '#1f1300',
        background: 'repeating-linear-gradient(135deg, #facc15 0 14px, #fde047 14px 28px)',
        borderBottom: '1px solid #a16207',
        opacity: 0.95,
      }}
    >
      {bannerText(label)}
    </div>
  );
}

export default StagingBanner;
