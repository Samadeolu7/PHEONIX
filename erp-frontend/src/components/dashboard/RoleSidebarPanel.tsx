/**
 * RoleSidebarPanel.tsx
 *
 * A slide-in drawer that displays the per-role quick-navigation links.
 * Rendered as a fixed-position overlay — it doesn't affect page layout.
 *
 * Usage:
 *   <RoleSidebarPanel open={navOpen} onClose={() => setNavOpen(false)} role={effectiveRole} />
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Settings, Navigation } from 'lucide-react';
import { BRAND } from '../../constants/brand';
import { getRoleSidebarButtons, NAV_CONFIG_ROLES } from '../../config/roleSidebarConfig';
import RenderedSidebarButton from './RenderedSidebarButton';

const C = BRAND.colors;

interface RoleSidebarPanelProps {
  open: boolean;
  onClose: () => void;
  role: string;
}

const RoleSidebarPanel: React.FC<RoleSidebarPanelProps> = ({ open, onClose, role }) => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const canConfigure = NAV_CONFIG_ROLES.includes(role);
  const buttons = getRoleSidebarButtons(role);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Trap focus inside panel when open
  useEffect(() => {
    if (open && panelRef.current) {
      const firstFocusable = panelRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [open]);

  const handleNavigate = (url: string) => {
    navigate(url);
    onClose();
  };

  const handleConfigureClick = () => {
    navigate('/settings/role-navigation');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 49,
          background: 'rgba(6,14,48,0.55)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${role} navigation panel`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '300px',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(180deg, ${C.navyDark} 0%, ${C.navyPrimary} 60%, ${C.navyLight} 100%)`,
          boxShadow: open ? '-8px 0 40px rgba(6,14,48,0.55)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Gold accent bar */}
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${C.gold}, ${C.goldDark})`, flexShrink: 0 }} />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: `rgba(183,151,88,0.18)`,
                border: `1px solid rgba(183,151,88,0.35)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Navigation style={{ width: '16px', height: '16px', color: C.gold }} />
            </div>
            <div>
              <p style={{ color: '#fff', fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>
                Quick Navigation
              </p>
              <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: '11px', fontWeight: 500, lineHeight: 1.2, marginTop: '2px' }}>
                {role}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close navigation panel"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.70)',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <X style={{ width: '15px', height: '15px' }} />
          </button>
        </div>

        {/* Navigation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          {buttons.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'rgba(255,255,255,0.35)',
                fontSize: '13px',
              }}
            >
              <Navigation style={{ width: '32px', height: '32px', margin: '0 auto 12px', opacity: 0.4 }} />
              <p>No navigation items configured for your role.</p>
              {canConfigure && (
                <button
                  onClick={handleConfigureClick}
                  style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: `rgba(183,151,88,0.18)`,
                    border: `1px solid rgba(183,151,88,0.40)`,
                    color: C.gold,
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Configure Navigation
                </button>
              )}
            </div>
          ) : (
            buttons.map(button => (
              <RenderedSidebarButton
                key={button.id}
                button={button}
                level={0}
                onNavigate={handleNavigate}
              />
            ))
          )}
        </div>

        {/* Footer — Configure link (Directors/Principals only) */}
        {canConfigure && buttons.length > 0 && (
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '12px 16px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleConfigureClick}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.60)',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = `rgba(183,151,88,0.12)`;
                el.style.color = C.gold;
                el.style.borderColor = `rgba(183,151,88,0.35)`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'rgba(255,255,255,0.04)';
                el.style.color = 'rgba(255,255,255,0.60)';
                el.style.borderColor = 'rgba(255,255,255,0.10)';
              }}
            >
              <Settings style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              Configure Role Navigation
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default RoleSidebarPanel;
