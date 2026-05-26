// src/components/dashboard/placeholder/ThemeCustomizationModalStyled.tsx
import React, { useState } from 'react';
import { X, Save, Palette, FileText, LayoutDashboard } from 'lucide-react';
import { DashboardTheme } from '../../../types';

interface ThemeCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (theme: DashboardTheme) => void;
  initialTheme?: DashboardTheme;
}

const ThemeCustomizationModalStyled: React.FC<ThemeCustomizationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTheme,
}) => {
  const [theme, setTheme] = useState<DashboardTheme>(
    initialTheme || {
      primaryColor: '#3b82f6',
      secondaryColor: '#10b981',
      accentColor: '#f59e0b',
      backgroundColor: '#f9fafb',
      textColor: '#1f2937',
      fontFamily: 'Inter, system-ui, sans-serif',
      widgetBorderRadius: 8,
      widgetShadow: '0 1px 3px rgba(0,0,0,0.12)',
    }
  );

  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'layout'>('colors');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(theme);
    onClose();
  };

  const presetThemes = [
    {
      name: 'Ocean Blue',
      theme: {
        ...theme,
        primaryColor: '#0284c7',
        secondaryColor: '#0891b2',
        accentColor: '#06b6d4',
        backgroundColor: '#f0f9ff',
      },
    },
    {
      name: 'Forest Green',
      theme: {
        ...theme,
        primaryColor: '#059669',
        secondaryColor: '#10b981',
        accentColor: '#34d399',
        backgroundColor: '#f0fdf4',
      },
    },
    {
      name: 'Sunset Orange',
      theme: {
        ...theme,
        primaryColor: '#ea580c',
        secondaryColor: '#f97316',
        accentColor: '#fb923c',
        backgroundColor: '#fff7ed',
      },
    },
    {
      name: 'Royal Purple',
      theme: {
        ...theme,
        primaryColor: '#7c3aed',
        secondaryColor: '#8b5cf6',
        accentColor: '#a78bfa',
        backgroundColor: '#faf5ff',
      },
    },
    {
      name: 'Dark Mode',
      theme: {
        ...theme,
        primaryColor: '#3b82f6',
        secondaryColor: '#10b981',
        accentColor: '#f59e0b',
        backgroundColor: '#1f2937',
        textColor: '#f9fafb',
      },
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          width: '100%',
          maxWidth: '56rem',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', margin: 0 }}>
              Theme Customization
            </h2>
            <p
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                marginTop: '0.25rem',
                marginBottom: 0,
              }}
            >
              Customize the look and feel
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: hoveredButton === 'close' ? '#f3f4f6' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={() => setHoveredButton('close')}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <X style={{ width: '1.25rem', height: '1.25rem' }} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            borderBottom: '1px solid #e5e7eb',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setActiveTab('colors')}
              onMouseEnter={() => setHoveredTab('colors')}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                padding: '0.75rem 1rem',
                borderBottom:
                  activeTab === 'colors' ? '2px solid #2563eb' : '2px solid transparent',
                fontWeight: 500,
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                color:
                  activeTab === 'colors'
                    ? '#2563eb'
                    : hoveredTab === 'colors'
                      ? '#374151'
                      : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Palette style={{ width: '1rem', height: '1rem' }} />
              Colors
            </button>
            <button
              onClick={() => setActiveTab('typography')}
              onMouseEnter={() => setHoveredTab('typography')}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                padding: '0.75rem 1rem',
                borderBottom:
                  activeTab === 'typography' ? '2px solid #2563eb' : '2px solid transparent',
                fontWeight: 500,
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                color:
                  activeTab === 'typography'
                    ? '#2563eb'
                    : hoveredTab === 'typography'
                      ? '#374151'
                      : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <FileText style={{ width: '1rem', height: '1rem' }} />
              Typography
            </button>
            <button
              onClick={() => setActiveTab('layout')}
              onMouseEnter={() => setHoveredTab('layout')}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                padding: '0.75rem 1rem',
                borderBottom:
                  activeTab === 'layout' ? '2px solid #2563eb' : '2px solid transparent',
                fontWeight: 500,
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                color:
                  activeTab === 'layout'
                    ? '#2563eb'
                    : hoveredTab === 'layout'
                      ? '#374151'
                      : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <LayoutDashboard style={{ width: '1rem', height: '1rem' }} />
              Layout
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* Colors Tab */}
          {activeTab === 'colors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Preset Themes */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.75rem',
                  }}
                >
                  Quick Presets
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '0.75rem',
                  }}
                >
                  {presetThemes.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => setTheme({ ...theme, ...preset.theme })}
                      onMouseEnter={() => setHoveredPreset(preset.name)}
                      onMouseLeave={() => setHoveredPreset(null)}
                      style={{
                        padding: '0.75rem',
                        border:
                          hoveredPreset === preset.name ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        transition: 'border-color 0.2s',
                        cursor: 'pointer',
                        background: 'white',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                        <div
                          style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: '0.25rem',
                            backgroundColor: preset.theme.primaryColor,
                          }}
                        />
                        <div
                          style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: '0.25rem',
                            backgroundColor: preset.theme.secondaryColor,
                          }}
                        />
                        <div
                          style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: '0.25rem',
                            backgroundColor: preset.theme.accentColor,
                          }}
                        />
                      </div>
                      <p
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          textAlign: 'center',
                          margin: 0,
                        }}
                      >
                        {preset.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                {/* Primary Color */}
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
                    Primary Color
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={theme.primaryColor}
                      onChange={e => setTheme({ ...theme, primaryColor: e.target.value })}
                      style={{
                        width: '4rem',
                        height: '2.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={theme.primaryColor}
                      onChange={e => setTheme({ ...theme, primaryColor: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>

                {/* Secondary Color */}
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
                    Secondary Color
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={theme.secondaryColor}
                      onChange={e => setTheme({ ...theme, secondaryColor: e.target.value })}
                      style={{
                        width: '4rem',
                        height: '2.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={theme.secondaryColor}
                      onChange={e => setTheme({ ...theme, secondaryColor: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>

                {/* Accent Color */}
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
                    Accent Color
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={theme.accentColor}
                      onChange={e => setTheme({ ...theme, accentColor: e.target.value })}
                      style={{
                        width: '4rem',
                        height: '2.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={theme.accentColor}
                      onChange={e => setTheme({ ...theme, accentColor: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>

                {/* Background Color */}
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
                    Background Color
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={theme.backgroundColor}
                      onChange={e => setTheme({ ...theme, backgroundColor: e.target.value })}
                      style={{
                        width: '4rem',
                        height: '2.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={theme.backgroundColor}
                      onChange={e => setTheme({ ...theme, backgroundColor: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>

                {/* Text Color */}
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
                    Text Color
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={theme.textColor}
                      onChange={e => setTheme({ ...theme, textColor: e.target.value })}
                      style={{
                        width: '4rem',
                        height: '2.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={theme.textColor}
                      onChange={e => setTheme({ ...theme, textColor: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Typography Tab */}
          {activeTab === 'typography' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                  Font Family
                </label>
                <select
                  value={theme.fontFamily}
                  onChange={e => setTheme({ ...theme, fontFamily: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="Inter, system-ui, sans-serif">Inter (Default)</option>
                  <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif">Segoe UI</option>
                  <option value="'Helvetica Neue', Helvetica, Arial, sans-serif">Helvetica</option>
                  <option value="Georgia, 'Times New Roman', Times, serif">Georgia</option>
                  <option value="'Courier New', Courier, monospace">Courier New</option>
                  <option value="system-ui, -apple-system, sans-serif">System Default</option>
                </select>
              </div>

              <div
                style={{
                  padding: '1.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontFamily: theme.fontFamily,
                }}
              >
                <h3
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    marginBottom: '0.5rem',
                    marginTop: 0,
                  }}
                >
                  Preview Text
                </h3>
                <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                  The quick brown fox jumps over the lazy dog.
                </p>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                  This is how your dashboard text will appear with the selected font.
                </p>
              </div>
            </div>
          )}

          {/* Layout Tab */}
          {activeTab === 'layout' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                  Widget Border Radius (px)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={theme.widgetBorderRadius}
                    onChange={e =>
                      setTheme({ ...theme, widgetBorderRadius: parseInt(e.target.value) })
                    }
                    style={{ flex: 1 }}
                  />
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      width: '3rem',
                      textAlign: 'right',
                    }}
                  >
                    {theme.widgetBorderRadius}px
                  </span>
                </div>
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
                  Widget Shadow
                </label>
                <select
                  value={theme.widgetShadow}
                  onChange={e => setTheme({ ...theme, widgetShadow: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="none">None</option>
                  <option value="0 1px 2px rgba(0,0,0,0.05)">Small</option>
                  <option value="0 1px 3px rgba(0,0,0,0.12)">Medium (Default)</option>
                  <option value="0 4px 6px rgba(0,0,0,0.1)">Large</option>
                  <option value="0 10px 15px rgba(0,0,0,0.1)">Extra Large</option>
                </select>
              </div>

              <div
                style={{
                  padding: '1.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  backgroundColor: '#f9fafb',
                }}
              >
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
                    backgroundColor: 'white',
                    padding: '1rem',
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', marginTop: 0 }}>
                    Sample Widget
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                    This shows how your widgets will appear with the current settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Live Preview */}
          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '0.75rem',
              }}
            >
              Dashboard Preview
            </label>
            <div
              style={{
                border: '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1rem',
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
                fontFamily: theme.fontFamily,
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: 'white',
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        backgroundColor: theme.primaryColor,
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>Primary</span>
                  </div>
                  <p
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: theme.primaryColor,
                      margin: 0,
                    }}
                  >
                    1,234
                  </p>
                </div>

                <div
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: 'white',
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        backgroundColor: theme.secondaryColor,
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>Secondary</span>
                  </div>
                  <p
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: theme.secondaryColor,
                      margin: 0,
                    }}
                  >
                    567
                  </p>
                </div>

                <div
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: 'white',
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        backgroundColor: theme.accentColor,
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>Accent</span>
                  </div>
                  <p
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: theme.accentColor,
                      margin: 0,
                    }}
                  >
                    89
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            onClick={onClose}
            onMouseEnter={() => setHoveredButton('cancel')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              backgroundColor: hoveredButton === 'cancel' ? '#f9fafb' : 'white',
              cursor: 'pointer',
              transition: 'background 0.2s',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            onMouseEnter={() => setHoveredButton('save')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '0.5rem',
              backgroundColor: hoveredButton === 'save' ? '#1d4ed8' : '#2563eb',
              color: 'white',
              cursor: 'pointer',
              transition: 'background 0.2s',
              fontSize: '0.875rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Save style={{ width: '1rem', height: '1rem' }} />
            Apply Theme
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemeCustomizationModalStyled;
