import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Shield, ChevronDown, ChevronRight, Check, Save,
  AlertTriangle, Loader2, Info, RefreshCw, Copy, Zap,
} from 'lucide-react';
import { PERMISSION_REGISTRY, ROLE_TEMPLATES } from '../../config/permissionRegistry';
import {
  permissionSetupService,
  RoleListItem,
  PolicyMap,
  PagePolicy,
} from '../../services/permissionSetupService';
import { PermissionEditor } from './components/PermissionEditor';
import { modulesData } from '../../config/permissionModules';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAG_COLS = [
  { key: 'can_view',   label: 'View',    short: 'V', color: 'bg-blue-100 text-blue-700' },
  { key: 'can_create', label: 'Create',  short: 'C', color: 'bg-green-100 text-green-700' },
  { key: 'can_edit',   label: 'Edit',    short: 'E', color: 'bg-amber-100 text-amber-700' },
  { key: 'can_delete', label: 'Delete',  short: 'D', color: 'bg-red-100 text-red-700' },
  { key: 'can_approve',label: 'Approve', short: 'A', color: 'bg-purple-100 text-purple-700' },
  { key: 'can_export', label: 'Export',  short: 'X', color: 'bg-indigo-100 text-indigo-700' },
] as const;

type FlagKey = typeof FLAG_COLS[number]['key'];

const SCOPE_OPTIONS = [
  { value: 'own_branch',       label: 'Own Branch' },
  { value: 'assigned_clients', label: 'Assigned Clients' },
  { value: 'global',           label: 'Global (All Branches)' },
  { value: 'own_records',      label: 'Own Records Only' },
];

const EMPTY_POLICY: PagePolicy = {
  can_view: false, can_create: false, can_edit: false,
  can_delete: false, can_approve: false, can_export: false,
  scope: 'own_branch', approval_limit: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function arePoliciesEqual(a: PolicyMap, b: PolicyMap): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.join(',') !== keysB.join(',')) return false;
  for (const key of keysA) {
    const pa = a[key]; const pb = b[key];
    for (const f of FLAG_COLS) {
      if (pa[f.key] !== pb[f.key]) return false;
    }
    if (pa.scope !== pb.scope) return false;
  }
  return true;
}

function getModuleScope(policies: PolicyMap, moduleCode: string): string {
  const modPages = PERMISSION_REGISTRY.find(m => m.code === moduleCode)?.pages ?? [];
  const scopes = modPages.map(p => policies[`${moduleCode}:${p.code}`]?.scope).filter(Boolean);
  if (scopes.length === 0) return 'own_branch';
  return scopes.every(s => s === scopes[0]) ? scopes[0] : 'mixed';
}

function getRoleStatus(role: RoleListItem): 'full' | 'partial' | 'none' {
  if (!role.has_policies) return 'none';
  const totalPages = PERMISSION_REGISTRY.reduce((acc, m) => acc + m.pages.length, 0);
  if (role.policy_count >= totalPages * 0.5) return 'full';
  return 'partial';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CheckboxCellProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color: string;
}
function CheckboxCell({ checked, onChange, disabled, color }: CheckboxCellProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        w-8 h-8 rounded flex items-center justify-center transition-all border
        ${checked
          ? `${color} border-transparent shadow-sm`
          : 'bg-white border-gray-200 hover:border-gray-400'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}
      `}
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  );
}

interface ScopeSelectProps {
  value: string;
  onChange: (v: string) => void;
}
function ScopeSelect({ value, onChange }: ScopeSelectProps) {
  if (value === 'mixed') {
    return (
      <span className="text-xs text-gray-400 italic">Mixed</span>
    );
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-indigo-400 min-w-[130px]"
    >
      {SCOPE_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PermissionSetupPage() {
  const [activePanel, setActivePanel] = useState<'policies' | 'actions'>('policies');
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [policies, setPolicies] = useState<PolicyMap>({});
  const [savedPolicies, setSavedPolicies] = useState<PolicyMap>({});
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout>>();

  const isDirty = useMemo(() => !arePoliciesEqual(policies, savedPolicies), [policies, savedPolicies]);
  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId), [roles, selectedRoleId]);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Initial load: sync registry then load roles ───────────────────────────
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        if (!syncDone) {
          setSyncing(true);
          await permissionSetupService.syncRegistry();
          setSyncDone(true);
          setSyncing(false);
        }
        const list = await permissionSetupService.getRoles();
        setRoles(list);
        if (list.length > 0) {
          setSelectedRoleId(list[0].id);
        }
      } catch (e: any) {
        showToast('error', 'Failed to load permission setup: ' + (e?.message ?? 'Unknown error'));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    }
    init();
  }, []);

  // ── Load policies when role changes ──────────────────────────────────────
  useEffect(() => {
    if (!selectedRoleId) return;
    setLoadingPolicies(true);
    permissionSetupService.getRolePolicies(selectedRoleId)
      .then(res => {
        setPolicies(res.policies ?? {});
        setSavedPolicies(res.policies ?? {});
        // Auto-expand modules that have configured pages
        const configured = new Set<string>();
        for (const key of Object.keys(res.policies ?? {})) {
          const [mod] = key.split(':');
          configured.add(mod);
        }
        setExpandedModules(configured.size > 0 ? configured : new Set(PERMISSION_REGISTRY.slice(0, 3).map(m => m.code)));
      })
      .catch(() => {
        setPolicies({});
        setSavedPolicies({});
        setExpandedModules(new Set(PERMISSION_REGISTRY.slice(0, 3).map(m => m.code)));
      })
      .finally(() => setLoadingPolicies(false));
  }, [selectedRoleId]);

  // ── Policy mutation helpers ───────────────────────────────────────────────
  const getPolicy = useCallback((key: string): PagePolicy =>
    policies[key] ?? { ...EMPTY_POLICY }, [policies]);

  const setPageFlag = useCallback((key: string, flag: FlagKey, value: boolean) => {
    setPolicies(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? { ...EMPTY_POLICY }), [flag]: value },
    }));
  }, []);

  const setPageScope = useCallback((key: string, scope: string) => {
    setPolicies(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? { ...EMPTY_POLICY }), scope },
    }));
  }, []);

  const toggleModuleAll = useCallback((moduleCode: string, value: boolean) => {
    const mod = PERMISSION_REGISTRY.find(m => m.code === moduleCode);
    if (!mod) return;
    setPolicies(prev => {
      const next = { ...prev };
      for (const page of mod.pages) {
        const key = `${moduleCode}:${page.code}`;
        next[key] = {
          ...(prev[key] ?? { ...EMPTY_POLICY }),
          can_view: value, can_create: value, can_edit: value,
          can_delete: value, can_approve: false, can_export: value,
        };
      }
      return next;
    });
  }, []);

  const setModuleScope = useCallback((moduleCode: string, scope: string) => {
    const mod = PERMISSION_REGISTRY.find(m => m.code === moduleCode);
    if (!mod) return;
    setPolicies(prev => {
      const next = { ...prev };
      for (const page of mod.pages) {
        const key = `${moduleCode}:${page.code}`;
        next[key] = { ...(prev[key] ?? { ...EMPTY_POLICY }), scope };
      }
      return next;
    });
  }, []);

  const toggleColumnAll = useCallback((flag: FlagKey, value: boolean) => {
    setPolicies(prev => {
      const next = { ...prev };
      for (const mod of PERMISSION_REGISTRY) {
        for (const page of mod.pages) {
          const key = `${mod.code}:${page.code}`;
          next[key] = { ...(prev[key] ?? { ...EMPTY_POLICY }), [flag]: value };
        }
      }
      return next;
    });
  }, []);

  // ── Apply template ────────────────────────────────────────────────────────
  const applyTemplate = useCallback((templateLabel: string) => {
    const tpl = ROLE_TEMPLATES.find(t => t.label === templateLabel);
    if (!tpl) return;
    const base: PolicyMap = {};
    for (const mod of PERMISSION_REGISTRY) {
      for (const page of mod.pages) {
        const key = `${mod.code}:${page.code}`;
        const fromTpl = tpl.policies[key];
        base[key] = fromTpl
          ? { ...fromTpl, approval_limit: null }
          : { ...EMPTY_POLICY };
      }
    }
    setPolicies(base);
    setSelectedTemplate('');
    showToast('success', `Template "${templateLabel}" applied — review and save.`);
  }, [showToast]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedRoleId || saving) return;
    setSaving(true);
    try {
      const result = await permissionSetupService.saveRolePolicies(selectedRoleId, policies);
      setSavedPolicies({ ...policies });
      // Update role list policy_count
      setRoles(prev => prev.map(r =>
        r.id === selectedRoleId
          ? { ...r, has_policies: result.saved > 0, policy_count: result.saved }
          : r
      ));
      const warn = result.warnings?.length ? ` (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})` : '';
      showToast('success', `Saved ${result.saved} policies for ${selectedRole?.name}${warn}.`);
    } catch (e: any) {
      showToast('error', 'Save failed: ' + (e?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }, [selectedRoleId, policies, saving, selectedRole, showToast]);

  // ── Copy from another role ────────────────────────────────────────────────
  const [copyFromRoleId, setCopyFromRoleId] = useState<string>('');
  const handleCopyFrom = useCallback(async () => {
    const fromId = parseInt(copyFromRoleId);
    if (!fromId) return;
    try {
      const res = await permissionSetupService.getRolePolicies(fromId);
      setPolicies(res.policies ?? {});
      setCopyFromRoleId('');
      showToast('success', `Copied policies from ${res.role.name} — review and save.`);
    } catch {
      showToast('error', 'Could not copy policies.');
    }
  }, [copyFromRoleId, showToast]);

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-indigo-500" size={36} />
        <span className="ml-3 text-gray-500">{syncing ? 'Syncing page registry…' : 'Loading…'}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ── Left sidebar: role list ── */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
            <Shield size={16} className="text-indigo-600" />
            Roles
          </div>
          <p className="text-xs text-gray-400 mt-1">Select a role to configure</p>
        </div>
        <nav className="py-2">
          {roles.map(role => {
            const status = getRoleStatus(role);
            const isSelected = role.id === selectedRoleId;
            return (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors
                  ${isSelected ? 'bg-indigo-50 border-r-2 border-indigo-500' : 'hover:bg-gray-50'}`}
              >
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                    {role.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {role.policy_count} page{role.policy_count !== 1 ? 's' : ''} configured
                  </div>
                </div>
                <span className={`ml-2 w-2.5 h-2.5 rounded-full shrink-0 ${
                  status === 'full' ? 'bg-green-400' :
                  status === 'partial' ? 'bg-amber-400' : 'bg-gray-300'
                }`} title={
                  status === 'full' ? 'Configured' :
                  status === 'partial' ? 'Partially configured' : 'Not configured'
                } />
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Right: permission matrix ── */}
      <main className="flex-1 overflow-y-auto">
        {!selectedRole ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            Select a role to configure its permissions.
          </div>
        ) : (
          <div className="max-w-6xl mx-auto p-6">

            {/* Header — role name always visible */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Shield size={20} className="text-indigo-600" />
                  {selectedRole.name}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {activePanel === 'policies'
                    ? 'Set what this role can see and do in each module'
                    : 'Set which specific system actions this role can perform'}
                </p>
              </div>

              {/* Policy tab tools — only show on Tab 1 */}
              {activePanel === 'policies' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Copy size={14} className="text-gray-400" />
                    <select
                      value={copyFromRoleId}
                      onChange={e => setCopyFromRoleId(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                    >
                      <option value="">Copy from role…</option>
                      {roles.filter(r => r.id !== selectedRoleId && r.has_policies).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {copyFromRoleId && (
                      <button
                        onClick={handleCopyFrom}
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <RefreshCw size={14} className="text-gray-400" />
                    <select
                      value={selectedTemplate}
                      onChange={e => { if (e.target.value) applyTemplate(e.target.value); }}
                      className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                    >
                      <option value="">Apply template…</option>
                      {ROLE_TEMPLATES.map(t => (
                        <option key={t.label} value={t.label}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${isDirty && !saving
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {saving ? 'Saving…' : isDirty ? 'Save Policies' : 'Saved'}
                  </button>
                </div>
              )}
            </div>

            {/* Unsaved-policy warning — visible on both tabs so user doesn't lose changes */}
            {isDirty && (
              <div className="mb-4 flex items-center justify-between gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={15} />
                  Unsaved page-policy changes for <strong>{selectedRole.name}</strong>
                  {activePanel === 'actions' && ' — switch to "Page Policies" tab to save'}
                </span>
                {activePanel === 'policies' && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700"
                  >
                    <Save size={12} /> Save now
                  </button>
                )}
              </div>
            )}

            {/* ── Tab switcher ───────────────────────────────────────── */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
              <button
                onClick={() => setActivePanel('policies')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activePanel === 'policies'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Shield size={15} />
                Page Policies
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  activePanel === 'policies' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  {Object.values(policies).filter(p => FLAG_COLS.some(f => p[f.key])).length} pages
                </span>
              </button>
              <button
                onClick={() => setActivePanel('actions')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activePanel === 'actions'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Zap size={15} />
                Action Permissions
              </button>
            </div>

            {/* ── Explanatory callout ─────────────────────────────────── */}
            {activePanel === 'policies' && (
              <div className="mb-5 flex gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <Shield size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                <div className="text-sm text-indigo-800">
                  <strong>Page Policies</strong> control whether this role can access each section and what they can do there —
                  View, Create, Edit, Delete, Approve, and Export. The <em>Scope</em> column determines what data they see:
                  their own branch only, their assigned clients, or all branches globally.
                  Configure this first before setting Action Permissions.
                </div>
              </div>
            )}
            {activePanel === 'actions' && (
              <div className="mb-5 flex gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Zap size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800">
                  <strong>Action Permissions</strong> control specific capabilities within each page — individual buttons
                  like "Bulk Approve Orders", "Export Client List", or "Process Loan Disbursement".
                  These gate individual API endpoints. Use Page Policies (the other tab) to set broad module access first,
                  then fine-tune specific actions here.
                </div>
              </div>
            )}

            {/* ── Tab 2: Action Permissions (PermissionEditor) ─────────── */}
            {activePanel === 'actions' && (
              <PermissionEditor
                modulesData={modulesData}
                controlledRoleId={selectedRoleId}
              />
            )}

            {/* ── Tab 1: Page Policies matrix ─────────────────────────── */}
            {activePanel === 'policies' && (
            <>

            {/* Legend */}
            <div className="mb-4 flex items-center gap-4 flex-wrap">
              {FLAG_COLS.map(col => (
                <span key={col.key} className="flex items-center gap-1.5 text-xs">
                  <span className={`px-2 py-0.5 rounded font-medium ${col.color}`}>{col.short}</span>
                  {col.label}
                </span>
              ))}
              <span className="text-xs text-gray-400 ml-2">
                <Info size={12} className="inline mr-1" />
                Click cells to toggle. Approve &amp; Delete require deliberate enabling.
              </span>
            </div>

            {/* Column-level bulk toggles */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Bulk actions (all modules)
                </span>
                <div className="flex items-center gap-2">
                  {FLAG_COLS.map(col => (
                    <div key={col.key} className="flex flex-col items-center gap-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${col.color}`}>{col.short}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleColumnAll(col.key, true)}
                          className="text-[10px] bg-green-50 hover:bg-green-100 text-green-700 px-1 rounded"
                          title={`Enable ${col.label} for all pages`}
                        >All</button>
                        <button
                          onClick={() => toggleColumnAll(col.key, false)}
                          className="text-[10px] bg-red-50 hover:bg-red-100 text-red-700 px-1 rounded"
                          title={`Disable ${col.label} for all pages`}
                        >None</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Loading overlay */}
            {loadingPolicies && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-indigo-400" size={24} />
                <span className="ml-2 text-gray-400 text-sm">Loading policies…</span>
              </div>
            )}

            {/* Module sections */}
            {!loadingPolicies && PERMISSION_REGISTRY.map(mod => {
              const isExpanded = expandedModules.has(mod.code);
              const configuredCount = mod.pages.filter(p => {
                const pol = policies[`${mod.code}:${p.code}`];
                return pol && FLAG_COLS.some(f => pol[f.key]);
              }).length;
              const modScope = getModuleScope(policies, mod.code);

              return (
                <div key={mod.code} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-3">
                  {/* Module header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                    onClick={() => setExpandedModules(prev => {
                      const next = new Set(prev);
                      next.has(mod.code) ? next.delete(mod.code) : next.add(mod.code);
                      return next;
                    })}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: mod.color }}
                      >
                        {mod.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">{mod.name}</div>
                        <div className="text-xs text-gray-400">
                          {configuredCount}/{mod.pages.length} pages configured
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                      {/* Module-level scope */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">Scope:</span>
                        <ScopeSelect
                          value={modScope}
                          onChange={scope => setModuleScope(mod.code, scope)}
                        />
                      </div>
                      {/* Module bulk enable/disable */}
                      <button
                        onClick={() => toggleModuleAll(mod.code, true)}
                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 px-2 py-1 rounded transition-colors"
                      >All On</button>
                      <button
                        onClick={() => toggleModuleAll(mod.code, false)}
                        className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded transition-colors"
                      >All Off</button>
                      {isExpanded
                        ? <ChevronDown size={16} className="text-gray-400" />
                        : <ChevronRight size={16} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Pages matrix */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {/* Column headers */}
                      <div className="grid items-center px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500"
                        style={{ gridTemplateColumns: '1fr repeat(6, 2rem) 160px' }}>
                        <span>Page</span>
                        {FLAG_COLS.map(col => (
                          <span key={col.key} className="text-center" title={col.label}>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${col.color}`}>{col.short}</span>
                          </span>
                        ))}
                        <span className="pl-2">Scope</span>
                      </div>

                      {/* Page rows */}
                      {mod.pages.map((page, idx) => {
                        const key = `${mod.code}:${page.code}`;
                        const pol = getPolicy(key);
                        const hasAny = FLAG_COLS.some(f => pol[f.key]);
                        return (
                          <div
                            key={page.code}
                            className={`grid items-center px-4 py-2.5 border-b border-gray-50 last:border-0
                              ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                              ${hasAny ? '' : 'opacity-60'}`}
                            style={{ gridTemplateColumns: '1fr repeat(6, 2rem) 160px' }}
                          >
                            <div className="min-w-0">
                              <div className="text-sm text-gray-700 font-medium truncate">{page.title}</div>
                              {page.description && (
                                <div className="text-xs text-gray-400 truncate">{page.description}</div>
                              )}
                            </div>
                            {FLAG_COLS.map(col => (
                              <div key={col.key} className="flex justify-center">
                                <CheckboxCell
                                  checked={pol[col.key]}
                                  onChange={v => setPageFlag(key, col.key, v)}
                                  color={col.color}
                                />
                              </div>
                            ))}
                            <div className="pl-2">
                              <ScopeSelect
                                value={pol.scope || 'own_branch'}
                                onChange={v => setPageScope(key, v)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bottom save bar */}
            {isDirty && (
              <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shadow-lg mt-4 rounded-t-xl">
                <span className="text-sm text-amber-700 font-medium flex items-center gap-2">
                  <AlertTriangle size={15} />
                  Unsaved policy changes for <strong>{selectedRole.name}</strong>
                </span>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Saving…' : 'Save Policies'}
                </button>
              </div>
            )}

            </> {/* end Tab 1 fragment */}
            )}

          </div>
        )}
      </main>
    </div>
  );
}
