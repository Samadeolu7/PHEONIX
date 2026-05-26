import React, { useState } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { HierarchyButton, ICON_OPTIONS } from '../../types';
import { BRAND } from '../../constants/brand';

const C = BRAND.colors;

interface RenderedSidebarButtonProps {
  button: HierarchyButton;
  level: number;
  onNavigate: (url: string) => void;
}

const RenderedSidebarButton: React.FC<RenderedSidebarButtonProps> = ({
  button,
  level,
  onNavigate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = button.children && button.children.length > 0;
  // Fall back to Menu icon so buttons with unrecognised icon names are still rendered
  const IconComp = ICON_OPTIONS.find(i => i.name === button.icon)?.component ?? Menu;

  const handleClick = () => {
    // Use frontendUrl if available, otherwise fall back to url
    const navigationUrl = button.frontendUrl || button.url;
    if (navigationUrl) {
      onNavigate(navigationUrl);
    } else if (hasChildren) {
      setExpanded(!expanded);
    }
  };

  // Top-level items get full accent treatment; children are more subdued
  const isTopLevel = level === 0;
  const iconBg = isTopLevel ? `rgba(232,184,0,0.15)` : 'rgba(255,255,255,0.08)';
  const iconColor = button.color || (isTopLevel ? C.gold : 'rgba(255,255,255,0.7)');
  const labelColor = isTopLevel ? '#ffffff' : 'rgba(255,255,255,0.80)';
  const hoverBg = isTopLevel ? 'rgba(232,184,0,0.08)' : 'rgba(255,255,255,0.05)';

  return (
    <div>
      <button
        onClick={handleClick}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: `10px 14px`,
          paddingLeft: `${level * 14 + 14}px`,
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background-color 0.15s',
          borderLeft: isTopLevel ? `3px solid transparent` : '3px solid transparent',
        }}
        onMouseOver={e => {
          e.currentTarget.style.backgroundColor = hoverBg;
          if (isTopLevel) e.currentTarget.style.borderLeftColor = C.gold;
        }}
        onMouseOut={e => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.borderLeftColor = 'transparent';
        }}
      >
        <div
          style={{
            padding: '6px',
            borderRadius: '7px',
            flexShrink: 0,
            backgroundColor: iconBg,
          }}
        >
          <IconComp style={{ width: '14px', height: '14px', color: iconColor }} />
        </div>

        <span
          style={{
            flex: 1,
            fontSize: isTopLevel ? '13px' : '12px',
            fontWeight: isTopLevel ? 600 : 400,
            color: labelColor,
            letterSpacing: isTopLevel ? '0.01em' : 0,
          }}
        >
          {button.label}
        </span>

        {hasChildren && (
          <ChevronRight
            style={{
              width: '14px',
              height: '14px',
              color: 'rgba(255,255,255,0.3)',
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0,
            }}
          />
        )}
      </button>

      {expanded && hasChildren && (
        <div style={{ borderLeft: `1px solid rgba(232,184,0,0.15)`, marginLeft: '22px' }}>
          {button.children!.map(child => (
            <RenderedSidebarButton
              key={child.id}
              button={child}
              level={level + 1}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RenderedSidebarButton;
