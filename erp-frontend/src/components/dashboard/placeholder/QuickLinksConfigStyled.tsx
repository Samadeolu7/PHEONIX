// src/components/dashboard/QuickLinksConfigStyled.tsx
import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Grip, Trash2 } from 'lucide-react';
import { ModulePage } from '../../../types';
import IconSelector from '../IconSelector';
import PagePicker, { stripEmoji } from '../PagePicker';

interface QuickLinksConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  pages: ModulePage[];
  initialConfig?: any;
}

// ── Main component ─────────────────────────────────────────────────────────

const QuickLinksConfig: React.FC<QuickLinksConfigProps> = ({
  isOpen,
  onClose,
  onSave,
  pages,
  initialConfig,
}) => {
  const [links, setLinks] = useState<any[]>(initialConfig?.links || []);
  const [layout, setLayout] = useState(initialConfig?.layout || 'grid');

  // Re-sync when modal opens with a different widget's config
  useEffect(() => {
    if (isOpen) {
      setLinks(initialConfig?.links || []);
      setLayout(initialConfig?.layout || 'grid');
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const addLink = () => {
    setLinks([
      ...links,
      {
        id: `link-${Date.now()}`,
        label: 'New Link',
        icon: 'link',
        color: '#3b82f6',
        url: '',
      },
    ]);
  };

  const updateLink = (index: number, field: string, value: any) => {
    const newLinks = [...links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setLinks(newLinks);
  };

  const deleteLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({ links, layout });
    onClose();
  };

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
          maxWidth: '48rem',
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
              Configure Quick Links
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Create shortcuts to important pages
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X style={{ width: '1.25rem', height: '1.25rem' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Layout Selection — unchanged */}
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
                Layout Style
              </label>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}
              >
                {['grid', 'list', 'compact'].map(layoutType => (
                  <button
                    key={layoutType}
                    onClick={() => setLayout(layoutType)}
                    style={{
                      padding: '0.75rem',
                      border: layout === layoutType ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      background: layout === layoutType ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      {layoutType.charAt(0).toUpperCase() + layoutType.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Links */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                }}
              >
                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Links ({links.length})
                </label>
                <button
                  onClick={addLink}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: '#3b82f6',
                    color: 'white',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = '#2563eb')}
                  onMouseOut={e => (e.currentTarget.style.background = '#3b82f6')}
                >
                  <Plus style={{ width: '1rem', height: '1rem' }} />
                  Add Link
                </button>
              </div>

              {links.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem',
                    border: '2px dashed #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      width: '3rem',
                      height: '3rem',
                      borderRadius: '50%',
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 0.75rem',
                    }}
                  >
                    <Search style={{ width: '1.5rem', height: '1.5rem', color: '#d1d5db' }} />
                  </div>
                  <p style={{ color: '#6b7280', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                    No links yet. Add a link and search from {pages.length} available pages.
                  </p>
                  <button
                    onClick={addLink}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#3b82f6',
                      color: 'white',
                      borderRadius: '0.5rem',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#2563eb')}
                    onMouseOut={e => (e.currentTarget.style.background = '#3b82f6')}
                  >
                    Add Your First Link
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {links.map((link, index) => (
                    <div
                      key={link.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                      }}
                    >
                      {/* Link header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          marginBottom: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Grip style={{ width: '1rem', height: '1rem', color: '#9ca3af' }} />
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            Link {index + 1}
                            {link.label && link.label !== 'New Link' && (
                              <span
                                style={{
                                  fontWeight: 400,
                                  color: '#6b7280',
                                  marginLeft: '0.375rem',
                                }}
                              >
                                — {link.label}
                              </span>
                            )}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteLink(index)}
                          style={{
                            padding: '0.25rem',
                            borderRadius: '0.25rem',
                            border: 'none',
                            background: 'transparent',
                            color: '#dc2626',
                            cursor: 'pointer',
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 style={{ width: '1rem', height: '1rem' }} />
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '0.75rem',
                        }}
                      >
                        {/* Label */}
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.75rem',
                              color: '#4b5563',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Label
                          </label>
                          <input
                            type="text"
                            value={link.label}
                            onChange={e => updateLink(index, 'label', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.375rem 0.5rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.25rem',
                              fontSize: '0.875rem',
                              boxSizing: 'border-box',
                            }}
                            placeholder="e.g., Dashboard, Reports"
                          />
                        </div>

                        {/* Page picker — replaced with searchable grouped picker */}
                        <div style={{ position: 'relative' }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.75rem',
                              color: '#4b5563',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Page
                          </label>
                          <PagePicker
                            pages={pages}
                            value={link.url}
                            onChange={(url, page) => {
                              updateLink(index, 'url', url);
                              // Auto-fill label from page title if label is still default
                              if (page && (link.label === 'New Link' || !link.label)) {
                                updateLink(index, 'label', stripEmoji(page.title));
                              }
                            }}
                          />
                        </div>

                        {/* Icon — unchanged */}
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.75rem',
                              color: '#4b5563',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Icon
                          </label>
                          <IconSelector
                            value={link.icon}
                            onChange={icon => updateLink(index, 'icon', icon)}
                          />
                        </div>

                        {/* Color — unchanged */}
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.75rem',
                              color: '#4b5563',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Color
                          </label>
                          <input
                            type="color"
                            value={link.color}
                            onChange={e => updateLink(index, 'color', e.target.value)}
                            style={{
                              width: '100%',
                              height: '2.25rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — unchanged */}
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
            onMouseOver={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseOut={e => (e.currentTarget.style.background = 'white')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#2563eb')}
            onMouseOut={e => (e.currentTarget.style.background = '#3b82f6')}
          >
            <Save style={{ width: '1rem', height: '1rem' }} />
            Save Links
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickLinksConfig;
