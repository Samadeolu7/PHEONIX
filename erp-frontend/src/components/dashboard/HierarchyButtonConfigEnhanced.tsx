// Enhanced HierarchyButtonConfig with proper page filtering
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Plus, Grip } from 'lucide-react';
import { HierarchyButton, ModulePage } from '../../types';

interface HierarchyButtonConfigProps {
  button: HierarchyButton;
  level: number;
  maxLevels: number;
  pages: ModulePage[];
  onChange: (button: HierarchyButton) => void;
  onDelete: () => void;
}

const HierarchyButtonConfigEnhanced: React.FC<HierarchyButtonConfigProps> = ({
  button,
  level,
  maxLevels,
  pages,
  onChange,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Filter pages by type for better UX
  const formPages = pages.filter(p => p.page_type === 'form');
  const reportPages = pages.filter(p => p.page_type === 'report');
  const dashboardPages = pages.filter(p => p.page_type === 'dashboard');

  // Group pages by module
  const pagesByModule = pages.reduce(
    (acc, page) => {
      const module = page.module || 'Other';
      if (!acc[module]) acc[module] = [];
      acc[module].push(page);
      return acc;
    },
    {} as Record<string, ModulePage[]>
  );

  const addChild = () => {
    const newChild: HierarchyButton = {
      id: `btn-${Date.now()}`,
      label: 'New Button',
      icon: 'file-text',
      children: [],
    };
    onChange({
      ...button,
      children: [...(button.children || []), newChild],
    });
    setExpanded(true);
  };

  const updateChild = (index: number, updatedChild: HierarchyButton) => {
    const newChildren = [...(button.children || [])];
    newChildren[index] = updatedChild;
    onChange({ ...button, children: newChildren });
  };

  const deleteChild = (index: number) => {
    const newChildren = (button.children || []).filter((_, i) => i !== index);
    onChange({ ...button, children: newChildren });
  };

  const isLastLevel = level >= maxLevels - 1;

  return (
    <div
      style={{
        borderLeft: '2px solid #e5e7eb',
        paddingLeft: '16px',
        marginLeft: '8px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '12px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Grip style={{ width: '16px', height: '16px', color: '#9ca3af', cursor: 'move' }} />
            <span style={{ fontWeight: 600, color: '#374151' }}>Level {level + 1} Button</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {!isLastLevel && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{ fontSize: '12px' }}>{button.children?.length || 0} children</span>
              </button>
            )}
            <button
              onClick={onDelete}
              style={{
                padding: '6px',
                border: 'none',
                borderRadius: '6px',
                background: '#fef2f2',
                color: '#dc2626',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Label */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '4px',
              }}
            >
              Label
            </label>
            <input
              type="text"
              value={button.label}
              onChange={e => onChange({ ...button, label: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
              }}
              placeholder="e.g., Finance, Reports, Dashboard, etc."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {/* Icon */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '4px',
                }}
              >
                Icon
              </label>
              <input
                type="text"
                value={button.icon}
                onChange={e => onChange({ ...button, icon: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
                placeholder="home, file-text, bar-chart"
              />
            </div>

            {/* Color */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '4px',
                }}
              >
                Color
              </label>
              <input
                type="color"
                value={button.color || '#3b82f6'}
                onChange={e => onChange({ ...button, color: e.target.value })}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '4px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              />
            </div>
          </div>

          {/* Page Selection - Only show on last level */}
          {isLastLevel && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '4px',
                }}
              >
                Link to Page
              </label>

              {/* Quick Filter Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '12px', color: '#6b7280', alignSelf: 'center' }}>
                  Filter:
                </span>
                <button
                  onClick={() => {
                    /* scroll to forms */
                  }}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: '#ecfdf5',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  📝 Forms ({formPages.length})
                </button>
                <button
                  onClick={() => {
                    /* scroll to reports */
                  }}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: '#eff6ff',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  📊 Reports ({reportPages.length})
                </button>
                <button
                  onClick={() => {
                    /* scroll to dashboards */
                  }}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: '#fef3c7',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  📈 Dashboards ({dashboardPages.length})
                </button>
              </div>

              <select
                value={button.url || ''}
                onChange={e => onChange({ ...button, url: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                }}
              >
                <option value="">-- Select a page --</option>

                {/* Group by module */}
                {Object.entries(pagesByModule).map(([module, modulePages]) => (
                  <optgroup key={module} label={module}>
                    {modulePages.map(page => (
                      <option key={page.id} value={page.url_path}>
                        {page.page_type === 'form' && '📝 '}
                        {page.page_type === 'report' && '📊 '}
                        {page.page_type === 'dashboard' && '📈 '}
                        {page.title}
                        {page.description && ` - ${page.description}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Show selected page info */}
              {button.url && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#15803d',
                  }}
                >
                  ✓ Linked to: <code>{button.url}</code>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Children Button (for non-last levels) */}
        {!isLastLevel && (
          <div
            style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <button
              onClick={addChild}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px dashed #9ca3af',
                borderRadius: '6px',
                background: '#f9fafb',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#4b5563',
              }}
            >
              <Plus size={16} />
              Add Sub-button (Level {level + 2})
            </button>
          </div>
        )}
      </div>

      {/* Render Children */}
      {expanded && !isLastLevel && (button.children?.length || 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {button.children!.map((child, idx) => (
            <HierarchyButtonConfigEnhanced
              key={child.id}
              button={child}
              level={level + 1}
              maxLevels={maxLevels}
              pages={pages}
              onChange={updated => updateChild(idx, updated)}
              onDelete={() => deleteChild(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HierarchyButtonConfigEnhanced;
