import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ICON_OPTIONS } from '../../types';

interface IconSelectorProps {
  value?: string;
  onChange: (icon: string) => void;
}

const IconSelector: React.FC<IconSelectorProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: buttonHover ? '1px solid #3b82f6' : '1px solid #d1d5db',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'white',
          cursor: 'pointer',
        }}
        onMouseOver={() => setButtonHover(true)}
        onMouseOut={() => setButtonHover(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {value &&
            (() => {
              const IconComp = ICON_OPTIONS.find(i => i.name === value)?.component;
              return IconComp ? <IconComp style={{ width: '16px', height: '16px' }} /> : null;
            })()}
          <span style={{ fontSize: '14px' }}>{value || 'Select icon'}</span>
        </div>
        <ChevronDown style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            marginTop: '4px',
            width: '100%',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            padding: '8px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {ICON_OPTIONS.map(icon => (
              <button
                key={icon.name}
                type="button"
                onClick={() => {
                  onChange(icon.name);
                  setOpen(false);
                }}
                style={{
                  padding: '12px',
                  borderRadius: '4px',
                  backgroundColor: value === icon.name ? '#dbeafe' : 'transparent',
                  border: value === icon.name ? '2px solid #3b82f6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onMouseOver={e =>
                  (e.currentTarget.style.backgroundColor =
                    value === icon.name ? '#dbeafe' : '#eff6ff')
                }
                onMouseOut={e =>
                  (e.currentTarget.style.backgroundColor =
                    value === icon.name ? '#dbeafe' : 'transparent')
                }
              >
                <icon.component style={{ width: '20px', height: '20px' }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IconSelector;
