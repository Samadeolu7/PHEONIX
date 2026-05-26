// src/components/dashboard/KPIWidgetConfig.tsx
import React, { useState } from 'react';
import { X, Save, TrendingUp, TrendingDown } from 'lucide-react';
import IconSelector from '../IconSelector';

interface KPIWidgetConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  initialConfig?: any;
}

const KPIWidgetConfig: React.FC<KPIWidgetConfigProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig,
}) => {
  const [value, setValue] = useState(initialConfig?.value || '1,234');
  const [format, setFormat] = useState(initialConfig?.format || 'number');
  const [label, setLabel] = useState(initialConfig?.label || 'Total Users');
  const [icon, setIcon] = useState(initialConfig?.icon || 'users');
  const [color, setColor] = useState(initialConfig?.color || '#3b82f6');
  const [showTrend, setShowTrend] = useState(initialConfig?.showTrend || false);
  const [trendValue, setTrendValue] = useState(initialConfig?.trendValue || '+12.5');
  const [trendDirection, setTrendDirection] = useState(initialConfig?.trendDirection || 'up');

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      value,
      format,
      label,
      icon,
      color,
      showTrend,
      trendValue,
      trendDirection,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '42rem',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
              Configure KPI Widget
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Set up your key performance indicator
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: 'white',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'white')}
          >
            <X style={{ width: '1.25rem', height: '1.25rem' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Value & Format */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Value
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="e.g., 1,234 or 45.6"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Format
                </label>
                <select
                  value={format}
                  onChange={e => setFormat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="number">Number</option>
                  <option value="currency">Currency (₦)</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="decimal">Decimal</option>
                </select>
              </div>
            </div>

            {/* Label */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g., Total Sales, Active Users"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            {/* Icon & Color */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Icon
                </label>
                <IconSelector value={icon} onChange={setIcon} />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Color
                </label>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{
                    width: '100%',
                    height: '2.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>

            {/* Trend Toggle */}
            <div style={{ paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={showTrend}
                  onChange={e => setShowTrend(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>
                    Show Trend Indicator
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Display change percentage
                  </div>
                </div>
              </label>
            </div>

            {/* Trend Settings */}
            {showTrend && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  paddingLeft: '1.75rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Trend Value
                  </label>
                  <input
                    type="text"
                    value={trendValue}
                    onChange={e => setTrendValue(e.target.value)}
                    placeholder="e.g., +12.5, -3.2"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Direction
                  </label>
                  <select
                    value={trendDirection}
                    onChange={e => setTrendDirection(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="up">Up (Positive)</option>
                    <option value="down">Down (Negative)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Preview */}
            <div style={{ paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.75rem',
                }}
              >
                Preview
              </label>
              <div
                style={{
                  background: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '0.5rem' }}>
                      {label}
                    </p>
                    <p style={{ fontSize: '2.25rem', fontWeight: 700, color }}>
                      {format === 'currency' && '₦'}
                      {value}
                      {format === 'percentage' && '%'}
                    </p>
                    {showTrend && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          marginTop: '0.75rem',
                          fontSize: '0.875rem',
                          color: trendDirection === 'up' ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {trendDirection === 'up' ? (
                          <TrendingUp
                            style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}
                          />
                        ) : (
                          <TrendingDown
                            style={{ width: '1rem', height: '1rem', marginRight: '0.25rem' }}
                          />
                        )}
                        <span style={{ fontWeight: 500 }}>{trendValue}%</span>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '9999px',
                      backgroundColor: `${color}20`,
                    }}
                  >
                    <div style={{ width: '2rem', height: '2rem', color }}>
                      {/* Icon placeholder */}
                      <svg
                        style={{ width: '2rem', height: '2rem' }}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              background: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'white')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')}
            onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}
          >
            <Save style={{ width: '1rem', height: '1rem' }} />
            Save KPI
          </button>
        </div>
      </div>
    </div>
  );
};

export default KPIWidgetConfig;
