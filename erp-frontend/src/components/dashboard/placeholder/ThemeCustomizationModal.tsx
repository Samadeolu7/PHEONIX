// src/components/dashboard/ThemeCustomizationModal.tsx
import React, { useState } from 'react';
import { X, Save, Palette, FileText, LayoutDashboard } from 'lucide-react';
import { DashboardTheme } from '../../../types';

interface ThemeCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (theme: DashboardTheme) => void;
  initialTheme?: DashboardTheme;
}

const ThemeCustomizationModal: React.FC<ThemeCustomizationModalProps> = ({
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
              Theme Customization
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
              Customize the look and feel
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{ borderBottom: '1px solid #e5e7eb', paddingLeft: '24px', paddingRight: '24px' }}
        >
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={() => setActiveTab('colors')}
              style={{
                padding: '12px 16px',
                borderBottom:
                  activeTab === 'colors' ? '2px solid #3b82f6' : '2px solid transparent',
                fontWeight: 500,
                fontSize: '14px',
                color: activeTab === 'colors' ? '#3b82f6' : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={e => {
                if (activeTab !== 'colors') e.currentTarget.style.color = '#374151';
              }}
              onMouseOut={e => {
                if (activeTab !== 'colors') e.currentTarget.style.color = '#6b7280';
              }}
            >
              <Palette
                style={{ width: '16px', height: '16px', display: 'inline', marginRight: '8px' }}
              />
              Colors
            </button>
            <button
              onClick={() => setActiveTab('typography')}
              style={{
                padding: '12px 16px',
                borderBottom:
                  activeTab === 'typography' ? '2px solid #3b82f6' : '2px solid transparent',
                fontWeight: 500,
                fontSize: '14px',
                color: activeTab === 'typography' ? '#3b82f6' : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={e => {
                if (activeTab !== 'typography') e.currentTarget.style.color = '#374151';
              }}
              onMouseOut={e => {
                if (activeTab !== 'typography') e.currentTarget.style.color = '#6b7280';
              }}
            >
              <FileText
                style={{ width: '16px', height: '16px', display: 'inline', marginRight: '8px' }}
              />
              Typography
            </button>
            <button
              onClick={() => setActiveTab('layout')}
              style={{
                padding: '12px 16px',
                borderBottom:
                  activeTab === 'layout' ? '2px solid #3b82f6' : '2px solid transparent',
                fontWeight: 500,
                fontSize: '14px',
                color: activeTab === 'layout' ? '#3b82f6' : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={e => {
                if (activeTab !== 'layout') e.currentTarget.style.color = '#374151';
              }}
              onMouseOut={e => {
                if (activeTab !== 'layout') e.currentTarget.style.color = '#6b7280';
              }}
            >
              <LayoutDashboard
                style={{ width: '16px', height: '16px', display: 'inline', marginRight: '8px' }}
              />
              Layout
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Colors Tab */}
          {activeTab === 'colors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Preset Themes */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '12px',
                  }}
                >
                  Quick Presets
                </label>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}
                >
                  {presetThemes.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => setTheme({ ...theme, ...preset.theme })}
                      style={{
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        background: 'white',
                        cursor: 'pointer',
                      }}
                      onMouseOver={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                      onMouseOut={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                    >
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            backgroundColor: preset.theme.primaryColor,
                          }}
                        />
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            backgroundColor: preset.theme.secondaryColor,
                          }}
                        />
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            backgroundColor: preset.theme.accentColor,
                          }}
                        />
                      </div>
                      <p style={{ fontSize: '12px', fontWeight: 500, textAlign: 'center' }}>
                        {preset.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Primary Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme.primaryColor}
                      onChange={e => setTheme({ ...theme, primaryColor: e.target.value })}
                      className="w-16 h-10 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme.primaryColor}
                      onChange={e => setTheme({ ...theme, primaryColor: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Secondary Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme.secondaryColor}
                      onChange={e => setTheme({ ...theme, secondaryColor: e.target.value })}
                      className="w-16 h-10 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme.secondaryColor}
                      onChange={e => setTheme({ ...theme, secondaryColor: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accent Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme.accentColor}
                      onChange={e => setTheme({ ...theme, accentColor: e.target.value })}
                      className="w-16 h-10 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme.accentColor}
                      onChange={e => setTheme({ ...theme, accentColor: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Background Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme.backgroundColor}
                      onChange={e => setTheme({ ...theme, backgroundColor: e.target.value })}
                      className="w-16 h-10 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme.backgroundColor}
                      onChange={e => setTheme({ ...theme, backgroundColor: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Text Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme.textColor}
                      onChange={e => setTheme({ ...theme, textColor: e.target.value })}
                      className="w-16 h-10 border rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme.textColor}
                      onChange={e => setTheme({ ...theme, textColor: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Typography Tab */}
          {activeTab === 'typography' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Font Family</label>
                <select
                  value={theme.fontFamily}
                  onChange={e => setTheme({ ...theme, fontFamily: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="Inter, system-ui, sans-serif">Inter (Default)</option>
                  <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif">Segoe UI</option>
                  <option value="'Helvetica Neue', Helvetica, Arial, sans-serif">Helvetica</option>
                  <option value="Georgia, 'Times New Roman', Times, serif">Georgia</option>
                  <option value="'Courier New', Courier, monospace">Courier New</option>
                  <option value="system-ui, -apple-system, sans-serif">System Default</option>
                </select>
              </div>

              <div className="p-6 border rounded-lg" style={{ fontFamily: theme.fontFamily }}>
                <h3 className="text-2xl font-bold mb-2">Preview Text</h3>
                <p className="text-base mb-2">The quick brown fox jumps over the lazy dog.</p>
                <p className="text-sm text-gray-600">
                  This is how your dashboard text will appear with the selected font.
                </p>
              </div>
            </div>
          )}

          {/* Layout Tab */}
          {activeTab === 'layout' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Widget Border Radius (px)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={theme.widgetBorderRadius}
                    onChange={e =>
                      setTheme({ ...theme, widgetBorderRadius: parseInt(e.target.value) })
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {theme.widgetBorderRadius}px
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Widget Shadow
                </label>
                <select
                  value={theme.widgetShadow}
                  onChange={e => setTheme({ ...theme, widgetShadow: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="none">None</option>
                  <option value="0 1px 2px rgba(0,0,0,0.05)">Small</option>
                  <option value="0 1px 3px rgba(0,0,0,0.12)">Medium (Default)</option>
                  <option value="0 4px 6px rgba(0,0,0,0.1)">Large</option>
                  <option value="0 10px 15px rgba(0,0,0,0.1)">Extra Large</option>
                </select>
              </div>

              <div className="p-6 border rounded-lg bg-gray-50">
                <label className="block text-sm font-medium text-gray-700 mb-3">Preview</label>
                <div
                  className="bg-white p-4"
                  style={{
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <h4 className="font-semibold mb-2">Sample Widget</h4>
                  <p className="text-sm text-gray-600">
                    This shows how your widgets will appear with the current settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Live Preview */}
          <div className="mt-6 pt-6 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Dashboard Preview
            </label>
            <div
              className="border-2 rounded-lg p-4"
              style={{
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
                fontFamily: theme.fontFamily,
              }}
            >
              <div className="flex gap-4 mb-4">
                <div
                  className="flex-1 p-4 bg-white"
                  style={{
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: theme.primaryColor }}
                    />
                    <span className="font-semibold">Primary</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: theme.primaryColor }}>
                    1,234
                  </p>
                </div>

                <div
                  className="flex-1 p-4 bg-white"
                  style={{
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: theme.secondaryColor }}
                    />
                    <span className="font-semibold">Secondary</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: theme.secondaryColor }}>
                    567
                  </p>
                </div>

                <div
                  className="flex-1 p-4 bg-white"
                  style={{
                    borderRadius: `${theme.widgetBorderRadius}px`,
                    boxShadow: theme.widgetShadow,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: theme.accentColor }}
                    />
                    <span className="font-semibold">Accent</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: theme.accentColor }}>
                    89
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 bg-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Apply Theme
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemeCustomizationModal;
