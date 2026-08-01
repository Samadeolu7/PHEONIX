import React from 'react';
import { LayoutDashboard, Menu, Settings } from 'lucide-react';
import { HierarchyButton } from '../../types';
import RenderedSidebarButton from './RenderedSidebarButton';
import { BRAND } from '../../constants/brand';

const C = BRAND.colors;

interface RenderedSidebarProps {
  config: {
    buttons?: HierarchyButton[];
    logoUrl?: string;
    logoSize?: string;
  };
  onNavigate: (url: string) => void;
  onEdit: () => void;
  onSwitch?: () => void;
}

const RenderedSidebar: React.FC<RenderedSidebarProps> = ({ config, onNavigate, onEdit, onSwitch }) => {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.navyPrimary,
        borderRight: `1px solid ${C.navyDark}`,
        boxShadow: '2px 0 12px rgba(0,0,0,0.25)',
      }}
    >
      {/* Gold accent bar at top */}
      <div
        style={{
          height: '4px',
          background: `linear-gradient(90deg,${C.gold} 0%,#fff6b0 50%,${C.gold} 100%)`,
          flexShrink: 0,
        }}
      />

      {/* Logo / Brand Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: `1px solid rgba(255,255,255,0.1)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: C.navyDark,
        }}
      >
        {config.logoUrl ? (
          <img
            src={config.logoUrl}
            alt="Logo"
            style={{ width: '120px', maxHeight: '52px', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                border: `2px solid ${C.gold}`,
                padding: '3px',
                background: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={BRAND.logoUrl}
                alt={BRAND.shortName}
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
                onError={e => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.style.display = 'none';
                  el.nextElementSibling?.removeAttribute('style');
                }}
              />
              <LayoutDashboard
                style={{ width: '20px', height: '20px', color: C.gold, display: 'none' }}
              />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: '13px', lineHeight: 1.2 }}>
                {BRAND.shortName}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: C.gold,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {BRAND.systemLabel}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          {onSwitch && (
            <button
              onClick={onSwitch}
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: `1px solid rgba(255,255,255,0.15)`,
                backgroundColor: 'rgba(255,255,255,0.07)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => {
                e.currentTarget.style.backgroundColor = 'rgba(232,184,0,0.15)';
                e.currentTarget.style.borderColor = C.gold;
              }}
              onMouseOut={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              }}
              title="Switch Dashboard"
            >
              <LayoutDashboard style={{ width: '14px', height: '14px', color: C.gold }} />
            </button>
          )}
          <button
            onClick={onEdit}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: `1px solid rgba(255,255,255,0.15)`,
              backgroundColor: 'rgba(255,255,255,0.07)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor = 'rgba(232,184,0,0.15)';
              e.currentTarget.style.borderColor = C.gold;
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
            title="Edit Layout"
          >
            <Settings style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}
      >
        {config.buttons && config.buttons.length > 0 ? (
          <div style={{ padding: '8px 0' }}>
            {config.buttons.map((button: HierarchyButton) => (
              <RenderedSidebarButton
                key={button.id}
                button={button}
                level={0}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div>
              <Menu
                style={{
                  width: '40px',
                  height: '40px',
                  color: 'rgba(255,255,255,0.2)',
                  margin: '0 auto 10px',
                }}
              />
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>
                No navigation configured
              </p>
              <button
                onClick={onEdit}
                style={{
                  marginTop: '10px',
                  fontSize: '13px',
                  color: C.gold,
                  fontWeight: 600,
                  border: `1px solid rgba(232,184,0,0.4)`,
                  background: 'rgba(232,184,0,0.08)',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(232,184,0,0.18)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(232,184,0,0.08)')}
              >
                Configure Navigation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid rgba(255,255,255,0.08)`,
          background: C.navyDark,
        }}
      >
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
          {BRAND.companyName}
        </div>
      </div>
    </div>
  );
};

export default RenderedSidebar;
