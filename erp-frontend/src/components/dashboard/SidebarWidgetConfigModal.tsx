import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Image, Layers, Menu } from 'lucide-react';
import { ModulePage, HierarchyButton } from '../../types';
import HierarchyButtonConfig from './HierarchyButtonConfig';
import { DASHBOARD_SIDEBAR_CONFIG } from '../../config/dashboardSidebarConfig';

interface SidebarWidgetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  pages: ModulePage[];
  initialConfig?: any;
}

const SidebarWidgetConfigModal: React.FC<SidebarWidgetConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  pages,
  initialConfig,
}) => {
  // Seed from DASHBOARD_SIDEBAR_CONFIG when no buttons have been configured yet
  const resolveButtons = (config: any): HierarchyButton[] => {
    if (config?.buttons && config.buttons.length > 0) return config.buttons;
    return DASHBOARD_SIDEBAR_CONFIG.buttons as HierarchyButton[];
  };

  const resolveHierarchyLevels = (config: any): number =>
    config?.hierarchyLevels ?? DASHBOARD_SIDEBAR_CONFIG.hierarchyLevels;

  const [hierarchyLevels, setHierarchyLevels] = useState<number>(
    resolveHierarchyLevels(initialConfig)
  );
  const [topLevelButtons, setTopLevelButtons] = useState<HierarchyButton[]>(
    resolveButtons(initialConfig)
  );
  const [logoUrl, setLogoUrl] = useState<string>(initialConfig?.logoUrl || '');
  const [logoSize, setLogoSize] = useState<string>(initialConfig?.logoSize || 'medium');

  // Re-sync whenever the modal is opened with a different dashboard's config
  useEffect(() => {
    if (isOpen) {
      setHierarchyLevels(resolveHierarchyLevels(initialConfig));
      setTopLevelButtons(resolveButtons(initialConfig));
      setLogoUrl(initialConfig?.logoUrl || '');
      setLogoSize(initialConfig?.logoSize || 'medium');
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const addTopLevelButton = () => {
    const newButton: HierarchyButton = {
      id: `btn-${Date.now()}`,
      label: 'New Section',
      icon: 'home',
      children: [],
    };
    setTopLevelButtons([...topLevelButtons, newButton]);
  };

  const updateButton = (index: number, updated: HierarchyButton) => {
    const newButtons = [...topLevelButtons];
    newButtons[index] = updated;
    setTopLevelButtons(newButtons);
  };

  const deleteButton = (index: number) => {
    setTopLevelButtons(topLevelButtons.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      hierarchyLevels,
      buttons: topLevelButtons,
      logoUrl,
      logoSize,
    });
    onClose();
  };

  const handleResetToDefault = () => {
    if (
      window.confirm(
        'Reset navigation to the default 8-module structure? This will replace your current configuration.'
      )
    ) {
      setTopLevelButtons(DASHBOARD_SIDEBAR_CONFIG.buttons as HierarchyButton[]);
      setHierarchyLevels(DASHBOARD_SIDEBAR_CONFIG.hierarchyLevels);
    }
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
              Configure Sidebar Navigation
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Set up hierarchical navigation structure
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Reset to default button */}
            <button
              onClick={handleResetToDefault}
              title="Reset to default 8-module structure"
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: '#6b7280',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              Reset to default
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'white',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <X style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* Logo Configuration */}
          <div
            style={{
              marginBottom: '1.5rem',
              paddingBottom: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h3
              style={{
                fontSize: '1.125rem',
                fontWeight: 500,
                color: '#111827',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Image style={{ width: '1.25rem', height: '1.25rem' }} />
              Logo Settings
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.25rem',
                  }}
                >
                  Logo URL
                </label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
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
                    marginBottom: '0.25rem',
                  }}
                >
                  Logo Size
                </label>
                <select
                  value={logoSize}
                  onChange={e => setLogoSize(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="small">Small (120px)</option>
                  <option value="medium">Medium (160px)</option>
                  <option value="large">Large (200px)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Hierarchy Configuration */}
          <div
            style={{
              marginBottom: '1.5rem',
              paddingBottom: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h3
              style={{
                fontSize: '1.125rem',
                fontWeight: 500,
                color: '#111827',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Layers style={{ width: '1.25rem', height: '1.25rem' }} />
              Navigation Structure
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Number of Hierarchy Levels
              </label>
              <select
                value={hierarchyLevels}
                onChange={e => setHierarchyLevels(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value={2}>2 Levels (Section → Page)</option>
                <option value={3}>3 Levels (Section → Category → Page)</option>
                <option value={4}>4 Levels (Section → Category → Sub-category → Page)</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Last level will always link to pages
              </p>
            </div>
          </div>

          {/* Buttons Configuration */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 500,
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Menu style={{ width: '1.25rem', height: '1.25rem' }} />
                Top Level Buttons ({topLevelButtons.length})
              </h3>
              <button
                type="button"
                onClick={addTopLevelButton}
                style={{
                  padding: '0.5rem 0.75rem',
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
                <Plus style={{ width: '1rem', height: '1rem' }} />
                Add Section
              </button>
            </div>

            {topLevelButtons.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem 0',
                  border: '2px dashed #d1d5db',
                  borderRadius: '0.5rem',
                }}
              >
                <Menu
                  style={{
                    width: '3rem',
                    height: '3rem',
                    color: '#d1d5db',
                    margin: '0 auto 0.75rem',
                  }}
                />
                <p style={{ color: '#6b7280', marginBottom: '1rem' }}>No navigation buttons yet</p>
                <button
                  type="button"
                  onClick={addTopLevelButton}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: 'white',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}
                >
                  Add Your First Section
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {topLevelButtons.map((button, idx) => (
                  <HierarchyButtonConfig
                    key={button.id}
                    button={button}
                    level={0}
                    maxLevels={hierarchyLevels}
                    pages={pages}
                    onChange={updated => updateButton(idx, updated)}
                    onDelete={() => deleteButton(idx)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f9fafb',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
            {topLevelButtons.length} top-level sections configured
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SidebarWidgetConfigModal;
