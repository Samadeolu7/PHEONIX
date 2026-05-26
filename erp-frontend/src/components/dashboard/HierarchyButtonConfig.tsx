import React, { useState } from 'react';
import { Grip, Trash2, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { HierarchyButton, ModulePage } from '../../types';
import IconSelector from './IconSelector';
import PagePicker, { stripEmoji } from './PagePicker';

interface HierarchyButtonConfigProps {
  button: HierarchyButton;
  level: number;
  maxLevels: number;
  pages: ModulePage[];
  onChange: (button: HierarchyButton) => void;
  onDelete: () => void;
}

const HierarchyButtonConfig: React.FC<HierarchyButtonConfigProps> = ({
  button,
  level,
  maxLevels,
  pages,
  onChange,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);

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

  const [expandHover, setExpandHover] = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);
  const [addSubHover, setAddSubHover] = useState(false);

  return (
    <div style={{ borderLeft: '2px solid #e5e7eb', paddingLeft: '16px', marginLeft: '8px' }}>
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '12px',
        }}
      >
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
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
              Level {level + 1} Button
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {!isLastLevel && (button.children?.length || 0) > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                style={{
                  padding: '4px',
                  backgroundColor: expandHover ? '#f3f4f6' : 'transparent',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseOver={() => setExpandHover(true)}
                onMouseOut={() => setExpandHover(false)}
              >
                {expanded ? (
                  <ChevronDown style={{ width: '16px', height: '16px' }} />
                ) : (
                  <ChevronRight style={{ width: '16px', height: '16px' }} />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              style={{
                padding: '4px',
                backgroundColor: deleteHover ? '#fef2f2' : 'transparent',
                borderRadius: '4px',
                color: '#dc2626',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={() => setDeleteHover(true)}
              onMouseOut={() => setDeleteHover(false)}
            >
              <Trash2 style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              Button Label
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
              placeholder="e.g., Finance, Reports, etc."
              onFocus={e => (e.target.style.boxShadow = '0 0 0 2px #3b82f6')}
              onBlur={e => (e.target.style.boxShadow = 'none')}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
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
              <IconSelector value={button.icon} onChange={icon => onChange({ ...button, icon })} />
            </div>

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
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              />
            </div>
          </div>

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
              <PagePicker
                pages={pages}
                value={button.url || ''}
                onChange={(url, page) => {
                  onChange({
                    ...button,
                    url,
                    // Auto-fill label when it's still the default
                    ...(page && (button.label === 'New Button' || !button.label)
                      ? { label: stripEmoji(page.title) }
                      : {}),
                  });
                }}
              />
            </div>
          )}
        </div>

        {!isLastLevel && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={addChild}
              style={{
                fontSize: '14px',
                color: addSubHover ? '#1d4ed8' : '#3b82f6',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              onMouseOver={() => setAddSubHover(true)}
              onMouseOut={() => setAddSubHover(false)}
            >
              <Plus style={{ width: '16px', height: '16px' }} />
              Add Sub-button
            </button>
          </div>
        )}
      </div>

      {expanded && !isLastLevel && (button.children?.length || 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {button.children!.map((child, idx) => (
            <HierarchyButtonConfig
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

export default HierarchyButtonConfig;
