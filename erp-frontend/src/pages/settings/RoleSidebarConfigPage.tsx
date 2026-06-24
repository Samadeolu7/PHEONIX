/**
 * RoleSidebarConfigPage.tsx
 *
 * Director/Principal-only settings page for configuring per-role quick navigation.
 * Accessible at /settings/role-navigation
 *
 * Features:
 * - Role selector tabs (left column)
 * - Full module tree with checkboxes (right column)
 * - Check/uncheck individual items or entire groups
 * - Save to localStorage, Reset to defaults
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, RotateCcw, CheckSquare, Square, ChevronDown, ChevronRight, Navigation, Settings, Loader } from 'lucide-react';
import { BRAND } from '../../constants/brand';
import { useAuth } from '../../contexts/AuthContext';
import { DASHBOARD_SIDEBAR_CONFIG } from '../../config/dashboardSidebarConfig';
import {
  ALL_ROLES,
  NAV_CONFIG_ROLES,
  collectAllIds,
  getEnabledIds,
  saveEnabledIds,
  resetEnabledIds,
} from '../../config/roleSidebarConfig';
import { navConfigService } from '../../services/navConfigService';
import { HierarchyButton } from '../../types';

const C = BRAND.colors;

// ── Checkbox tree item ────────────────────────────────────────────────────────

interface TreeItemProps {
  button: HierarchyButton;
  level: number;
  enabledIds: Set<string>;
  onToggle: (id: string, allIds: string[]) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({ button, level, enabledIds, onToggle }) => {
  const [expanded, setExpanded] = useState(level === 0);
  const hasChildren = (button.children ?? []).length > 0;
  const childIds = hasChildren ? [...collectAllIds(button.children!)] : [];
  const leafIds = childIds.filter(id => {
    // a leaf has no children
    const find = (btns: HierarchyButton[], targetId: string): HierarchyButton | undefined => {
      for (const b of btns) {
        if (b.id === targetId) return b;
        if (b.children) { const found = find(b.children, targetId); if (found) return found; }
      }
      return undefined;
    };
    const node = find(DASHBOARD_SIDEBAR_CONFIG.buttons, id);
    return node && (!node.children || node.children.length === 0);
  });

  // Determine check state
  const isLeaf = !hasChildren;
  const checked = isLeaf ? enabledIds.has(button.id) : leafIds.every(id => enabledIds.has(id));
  const indeterminate = !isLeaf && !checked && leafIds.some(id => enabledIds.has(id));

  const handleCheck = () => {
    if (isLeaf) {
      onToggle(button.id, [button.id]);
    } else {
      // toggle all leaf descendants
      onToggle(button.id, leafIds);
    }
  };

  const indent = level * 20;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: `7px 12px`,
          paddingLeft: `${12 + indent}px`,
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'background 0.12s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(10,24,87,0.04)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        {/* Expand toggle for groups */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(x => !x)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
          >
            {expanded
              ? <ChevronDown style={{ width: '14px', height: '14px', color: C.textSecondary }} />
              : <ChevronRight style={{ width: '14px', height: '14px', color: C.textSecondary }} />
            }
          </button>
        ) : (
          <span style={{ width: '14px', flexShrink: 0 }} />
        )}

        {/* Checkbox */}
        <button
          onClick={handleCheck}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
          aria-checked={indeterminate ? 'mixed' : checked}
        >
          {checked ? (
            <CheckSquare style={{ width: '16px', height: '16px', color: C.navyPrimary }} />
          ) : indeterminate ? (
            <CheckSquare style={{ width: '16px', height: '16px', color: C.gold, opacity: 0.6 }} />
          ) : (
            <Square style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
          )}
        </button>

        {/* Label */}
        <span
          onClick={hasChildren ? () => setExpanded(x => !x) : handleCheck}
          style={{
            fontSize: level === 0 ? '13px' : '12px',
            fontWeight: level === 0 ? 700 : level === 1 ? 600 : 400,
            color: level === 0 ? C.navyPrimary : level === 1 ? C.navyLight : '#374151',
            textTransform: level === 0 ? 'uppercase' : level === 1 ? 'uppercase' : 'none',
            letterSpacing: level < 2 ? '0.05em' : 'normal',
            cursor: 'pointer',
            flex: 1,
          }}
        >
          {button.label}
        </span>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {button.children!.map(child => (
            <TreeItem
              key={child.id}
              button={child}
              level={level + 1}
              enabledIds={enabledIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const RoleSidebarConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedRole } = useAuth();

  // Guard: only Director/Principal
  const canAccess = NAV_CONFIG_ROLES.includes(selectedRole ?? '');

  const [activeRole, setActiveRole] = useState(ALL_ROLES[0]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reload from server whenever the active role tab changes
  useEffect(() => {
    setSaved(false);
    setSaveError(null);
    // Refresh from server so the config page always shows the latest saved state
    navConfigService.fetchAll()
      .then(() => setEnabledIds(getEnabledIds(activeRole)))
      .catch(() => setEnabledIds(getEnabledIds(activeRole)));
  }, [activeRole]);

  const handleToggle = useCallback((id: string, ids: string[]) => {
    setEnabledIds(prev => {
      const next = new Set(prev);
      const allChecked = ids.every(i => next.has(i));
      if (allChecked) {
        ids.forEach(i => next.delete(i));
      } else {
        ids.forEach(i => next.add(i));
      }
      return next;
    });
    setSaved(false);
    setSaveError(null);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveEnabledIds(activeRole, enabledIds);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Save failed — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await resetEnabledIds(activeRole);
      setEnabledIds(getEnabledIds(activeRole));
      setSaved(false);
    } catch {
      setSaveError('Reset failed — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckAll = () => {
    const all = collectAllIds(DASHBOARD_SIDEBAR_CONFIG.buttons);
    // Only check leaf nodes
    const leaves = new Set<string>();
    const collectLeaves = (btns: HierarchyButton[]) => {
      for (const b of btns) {
        if (!b.children || b.children.length === 0) leaves.add(b.id);
        else collectLeaves(b.children);
      }
    };
    collectLeaves(DASHBOARD_SIDEBAR_CONFIG.buttons);
    setEnabledIds(leaves);
    setSaved(false);
  };

  const handleUncheckAll = () => {
    setEnabledIds(new Set());
    setSaved(false);
  };

  if (!canAccess) {
    return (
      <div style={{ minHeight: '100vh', background: C.offWhite, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Navigation style={{ width: '48px', height: '48px', color: C.gold, margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: C.navyPrimary, marginBottom: '8px' }}>
            Access Restricted
          </h2>
          <p style={{ color: C.textSecondary, fontSize: '14px' }}>
            Only Directors and Principals can configure role navigation.
          </p>
          <button
            onClick={() => navigate(-1)}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: C.navyPrimary,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.offWhite }}>

      {/* Page header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.navyDark} 0%, ${C.navyPrimary} 100%)`,
          padding: '24px 32px',
          boxShadow: `0 4px 24px rgba(10,24,87,0.25)`,
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: C.goldLight,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
              padding: 0,
            }}
          >
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Back
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: `rgba(183,151,88,0.20)`,
                border: `1.5px solid rgba(183,151,88,0.45)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Settings style={{ width: '20px', height: '20px', color: C.gold }} />
            </div>
            <div>
              <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, lineHeight: 1.2 }}>
                Role Navigation Configuration
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', marginTop: '3px' }}>
                Configure the quick-access sidebar links shown to each role
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* Role tabs (left) */}
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              border: `1px solid #e8e0d0`,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(10,24,87,0.06)',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #e8e0d0',
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: C.textSecondary,
              }}
            >
              Roles
            </div>
            {ALL_ROLES.map(role => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 16px',
                  border: 'none',
                  borderBottom: '1px solid #f0ece4',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: activeRole === role ? 700 : 500,
                  color: activeRole === role ? C.navyPrimary : '#374151',
                  background: activeRole === role
                    ? `rgba(10,24,87,0.06)`
                    : 'transparent',
                  borderLeft: activeRole === role ? `3px solid ${C.gold}` : '3px solid transparent',
                  transition: 'background 0.12s',
                }}
              >
                {role}
              </button>
            ))}
          </div>

          {/* Config panel (right) */}
          <div>
            {/* Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 800, color: C.navyPrimary, marginBottom: '2px' }}>
                  {activeRole}
                </h2>
                <p style={{ fontSize: '12px', color: C.textSecondary }}>
                  Select which navigation items are shown to users with this role
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleCheckAll}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    border: `1px solid #d1d5db`,
                    background: '#fff',
                    color: '#374151',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <CheckSquare style={{ width: '13px', height: '13px' }} />
                  Check All
                </button>
                <button
                  onClick={handleUncheckAll}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    border: `1px solid #d1d5db`,
                    background: '#fff',
                    color: '#374151',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Square style={{ width: '13px', height: '13px' }} />
                  Uncheck All
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    border: `1px solid #d1d5db`,
                    background: '#fff',
                    color: '#374151',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  {saving
                    ? <Loader style={{ width: '13px', height: '13px', animation: 'spin 1s linear infinite' }} />
                    : <RotateCcw style={{ width: '13px', height: '13px' }} />
                  }
                  Reset Default
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '7px',
                    border: 'none',
                    background: saved
                      ? '#16a34a'
                      : `linear-gradient(135deg, ${C.navyDark}, ${C.navyPrimary})`,
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: `0 2px 8px rgba(10,24,87,0.20)`,
                    transition: 'background 0.2s',
                  }}
                >
                  {saving
                    ? <Loader style={{ width: '13px', height: '13px', animation: 'spin 1s linear infinite' }} />
                    : <Save style={{ width: '13px', height: '13px' }} />
                  }
                  {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Tree */}
            <div
              style={{
                background: '#fff',
                borderRadius: '12px',
                border: `1px solid #e8e0d0`,
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(10,24,87,0.06)',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #e8e0d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: C.textSecondary,
                  }}
                >
                  Available Navigation Items
                </span>
                <span style={{ fontSize: '11px', color: C.textSecondary }}>
                  {enabledIds.size} items selected
                </span>
              </div>

              <div style={{ padding: '8px 4px', maxHeight: '600px', overflowY: 'auto' }}>
                {DASHBOARD_SIDEBAR_CONFIG.buttons.map(button => (
                  <TreeItem
                    key={button.id}
                    button={button}
                    level={0}
                    enabledIds={enabledIds}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>

            {saveError && (
              <p style={{ marginTop: '12px', fontSize: '12px', color: '#dc2626', textAlign: 'right' }}>
                {saveError}
              </p>
            )}
            {!saved && !saveError && (
              <p style={{ marginTop: '12px', fontSize: '12px', color: C.textSecondary, textAlign: 'right' }}>
                Changes are synced to the server and applied across all devices.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSidebarConfigPage;
