/**
 * PagePicker — shared searchable page-picker dropdown used by
 * QuickLinksConfigStyled and HierarchyButtonConfig.
 *
 * Features
 * ─────────
 * • Groups pages by `category` (featureRegistry sub-category), sorted A→Z
 * • Multi-field search: title, category, module, url_path, description
 * • isNew / isEnhanced badges
 * • Sticky group headers
 * • Outside-click dismiss, auto-focus search input, arrow-key navigation
 * • Check-mark for currently selected item
 * • Count display + clear-selection button
 * • Strips leading emoji from displayed titles
 * • Full ARIA combobox/listbox/option roles with aria-activedescendant
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { ModulePage } from '../../types';
import { generateFrontendUrl } from '../../utils/dashboardUtils';
import { stripLeadingEmoji } from '../../utils/text';

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Backwards-compatible alias — existing consumers import { stripEmoji } from './PagePicker'.
 * @deprecated Use stripLeadingEmoji from '../../utils/text' directly in new code.
 */
export const stripEmoji = stripLeadingEmoji;

/**
 * Group an array of ModulePages by their `category` field,
 * returning groups sorted A→Z with links within each group also A→Z.
 */
export function groupPagesByCategory(
  pages: ModulePage[]
): { category: string; links: ModulePage[] }[] {
  const map = new Map<string, ModulePage[]>();

  for (const page of pages) {
    const key = page.category ?? page.module ?? 'Other';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(page);
  }

  for (const group of map.values()) {
    group.sort((a, b) =>
      stripLeadingEmoji(a.title).localeCompare(stripLeadingEmoji(b.title))
    );
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, links]) => ({ category, links }));
}

// ── Component ──────────────────────────────────────────────────────────────

export interface PagePickerProps {
  pages: ModulePage[];
  /** Current value — the URL that was previously emitted by onChange */
  value: string;
  onChange: (url: string, page: ModulePage | undefined) => void;
  placeholder?: string;
}

const PagePicker: React.FC<PagePickerProps> = ({
  pages,
  value,
  onChange,
  placeholder = 'Select page…',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Stable ID prefix for ARIA linkage (constant across renders)
  const idBase = useRef(`pp-${Math.random().toString(36).slice(2, 7)}`);
  const PICKER_ID = idBase.current;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-focus search input when the dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  // Reset keyboard cursor when search query or open state changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [search, open]);

  // Scroll the highlighted option into view
  useEffect(() => {
    if (activeIndex >= 0) {
      optionRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const selectedPage = pages.find(
    p => p.url_path === value || generateFrontendUrl(p) === value
  );
  const displayTitle = selectedPage ? stripLeadingEmoji(selectedPage.title) : '';

  const filteredPages = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter(
      p =>
        stripLeadingEmoji(p.title).toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.module ?? '').toLowerCase().includes(q) ||
        p.url_path.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
    );
  }, [pages, search]);

  const grouped = useMemo(() => groupPagesByCategory(filteredPages), [filteredPages]);

  // Flat list of all visible options — used for keyboard navigation
  const flatPages = useMemo(() => grouped.flatMap(g => g.links), [grouped]);

  const handleSelect = (page: ModulePage) => {
    const frontendUrl = generateFrontendUrl(page);
    onChange(frontendUrl || page.url_path, page);
    setOpen(false);
    setSearch('');
  };

  // Open dropdown and let the auto-focus effect move focus to the search input
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  // Arrow navigation + Enter-to-select + Escape-to-close on the search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, flatPages.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && flatPages[activeIndex]) {
          handleSelect(flatPages[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSearch('');
        break;
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${PICKER_ID}-listbox`}
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        style={{
          width: '100%',
          padding: '0.375rem 0.5rem',
          border: '1px solid #d1d5db',
          borderRadius: '0.25rem',
          fontSize: '0.875rem',
          background: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          textAlign: 'left',
          color: displayTitle ? '#111827' : '#9ca3af',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#6b7280')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
      >
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
        >
          {displayTitle || placeholder}
        </span>
        <ChevronDown
          style={{
            width: '0.875rem',
            height: '0.875rem',
            flexShrink: 0,
            color: '#9ca3af',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 200,
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '320px',
            minWidth: '260px',
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '13px',
                  height: '13px',
                  color: '#9ca3af',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-controls={`${PICKER_ID}-listbox`}
                aria-activedescendant={
                  activeIndex >= 0 ? `${PICKER_ID}-opt-${activeIndex}` : undefined
                }
                aria-label="Search pages"
                placeholder="Search pages…"
                style={{
                  width: '100%',
                  padding: '5px 8px 5px 28px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  fontSize: '0.8125rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
              />
            </div>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '4px 0 0', paddingLeft: '2px' }}>
              {filteredPages.length} of {pages.length} pages
            </p>
          </div>

          {/* Clear selection */}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('', undefined);
                setOpen(false);
                setSearch('');
              }}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                color: '#dc2626',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                textAlign: 'left',
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              ✕ Clear selection
            </button>
          )}

          {/* Grouped results */}
          <div
            role="listbox"
            id={`${PICKER_ID}-listbox`}
            aria-label="Available pages"
            style={{ overflowY: 'auto', flex: 1 }}
          >
            {grouped.length === 0 ? (
              <p
                role="status"
                style={{ padding: '1rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}
              >
                No pages match &ldquo;{search}&rdquo;
              </p>
            ) : (
              grouped.map(({ category, links }, groupIdx) => {
                const startIndex = grouped
                  .slice(0, groupIdx)
                  .reduce((sum, g) => sum + g.links.length, 0);

                return (
                  <div key={category}>
                    {/* Sticky category header */}
                    <div
                      role="presentation"
                      style={{
                        padding: '5px 10px 3px',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        background: '#f9fafb',
                        borderTop: '1px solid #f3f4f6',
                        position: 'sticky',
                        top: 0,
                      }}
                    >
                      {category}
                    </div>

                    {links.map((page, linkIdx) => {
                      const flatIdx = startIndex + linkIdx;
                      const isActive = activeIndex === flatIdx;
                      const isSelected =
                        value === page.url_path || value === generateFrontendUrl(page);
                      const title = stripLeadingEmoji(page.title);
                      return (
                        <button
                          key={page.id}
                          id={`${PICKER_ID}-opt-${flatIdx}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          ref={el => {
                            if (el) optionRefs.current.set(flatIdx, el);
                            else optionRefs.current.delete(flatIdx);
                          }}
                          onClick={() => handleSelect(page)}
                          style={{
                            width: '100%',
                            padding: '6px 10px 6px 14px',
                            background: isActive
                              ? '#dbeafe'
                              : isSelected
                              ? '#eff6ff'
                              : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '6px',
                          }}
                          onMouseEnter={e => {
                            if (!isActive && !isSelected)
                              e.currentTarget.style.background = '#f9fafb';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = isActive
                              ? '#dbeafe'
                              : isSelected
                              ? '#eff6ff'
                              : 'transparent';
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {/* Title + badges */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '0.8125rem',
                                  color: isSelected ? '#1d4ed8' : '#111827',
                                  fontWeight: isSelected ? 500 : 400,
                                  lineHeight: 1.3,
                                }}
                              >
                                {title}
                              </span>
                              {page.isNew && (
                                <span
                                  style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    background: '#d1fae5',
                                    color: '#065f46',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    letterSpacing: '0.04em',
                                    flexShrink: 0,
                                  }}
                                >
                                  NEW
                                </span>
                              )}
                              {page.isEnhanced && (
                                <span
                                  style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    background: '#dbeafe',
                                    color: '#1e40af',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    letterSpacing: '0.04em',
                                    flexShrink: 0,
                                  }}
                                >
                                  ENHANCED
                                </span>
                              )}
                            </div>
                            {/* Path */}
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                color: '#9ca3af',
                                fontFamily: 'monospace',
                                display: 'block',
                                marginTop: '1px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {page.url_path}
                            </span>
                          </div>
                          {isSelected && (
                            <Check
                              style={{
                                width: '13px',
                                height: '13px',
                                color: '#2563eb',
                                flexShrink: 0,
                                marginTop: '2px',
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PagePicker;
