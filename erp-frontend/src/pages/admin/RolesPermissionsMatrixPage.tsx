import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  rolePermissionService,
  type Module,
  type Role,
  type PermissionEntry,
  type BulkUpdateItem,
} from '../../services/rolePermissionService';
import { useAuth } from '../../contexts/AuthContext';

// Permission flag keys
const PERM_FLAGS = [
  'can_view',
  'can_create',
  'can_edit',
  'can_delete',
  'can_approve',
  'can_export',
] as const;
type PermFlag = (typeof PERM_FLAGS)[number];

const FLAG_LABELS: Record<PermFlag, string> = {
  can_view: 'View',
  can_create: 'Create',
  can_edit: 'Edit',
  can_delete: 'Delete',
  can_approve: 'Approve',
  can_export: 'Export',
};

const FLAG_COLORS: Record<PermFlag, { on: string; off: string }> = {
  can_view: { on: 'bg-blue-100 border-blue-500 text-blue-600', off: 'bg-gray-100 border-gray-300' },
  can_create: {
    on: 'bg-green-100 border-green-500 text-green-600',
    off: 'bg-gray-100 border-gray-300',
  },
  can_edit: {
    on: 'bg-amber-100 border-amber-500 text-amber-600',
    off: 'bg-gray-100 border-gray-300',
  },
  can_delete: { on: 'bg-red-100 border-red-500 text-red-600', off: 'bg-gray-100 border-gray-300' },
  can_approve: {
    on: 'bg-purple-100 border-purple-500 text-purple-600',
    off: 'bg-gray-100 border-gray-300',
  },
  can_export: {
    on: 'bg-teal-100 border-teal-500 text-teal-600',
    off: 'bg-gray-100 border-gray-300',
  },
};

export const RolesPermissionsMatrixPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Local permission overrides (unsaved changes)
  const [overrides, setOverrides] = useState<Record<string, Partial<PermissionEntry>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  // Fetch permission matrix from backend
  const {
    data: matrix,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['permissionMatrix'],
    queryFn: () => rolePermissionService.getPermissionMatrix(),
    staleTime: 30_000,
  });

  const modules: Module[] = useMemo(() => matrix?.modules ?? [], [matrix]);
  const roles: Role[] = useMemo(() => matrix?.roles ?? [], [matrix]);
  const serverPermissions = useMemo(() => matrix?.permissions ?? {}, [matrix]);

  // Merge server data with local overrides
  const getPermission = useCallback(
    (roleId: number, actionId: number): PermissionEntry => {
      const key = `${roleId}-${actionId}`;
      const server: PermissionEntry = (serverPermissions as Record<string, PermissionEntry>)[
        key
      ] ?? {
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_approve: false,
        can_export: false,
      };
      const local = overrides[key];
      return local ? { ...server, ...local } : server;
    },
    [serverPermissions, overrides]
  );

  const pendingCount = useMemo(() => Object.keys(overrides).length, [overrides]);

  // Toggle a single flag
  const toggleFlag = useCallback(
    (roleId: number, actionId: number, flag: PermFlag) => {
      if (!isAdmin) return;
      const key = `${roleId}-${actionId}`;
      setOverrides(prev => {
        const current = { ...prev };
        const existing = current[key] ?? {};
        const serverEntry = (serverPermissions as Record<string, PermissionEntry>)[key];
        const serverVal = serverEntry?.[flag] ?? false;
        const currentVal = existing[flag] ?? serverVal;
        const newVal = !currentVal;

        // If toggling back to server value, remove override for this flag
        if (newVal === serverVal) {
          const updated = { ...existing };
          delete updated[flag];
          if (Object.keys(updated).length === 0) {
            delete current[key];
          } else {
            current[key] = updated;
          }
        } else {
          current[key] = { ...existing, [flag]: newVal };
        }
        return { ...current };
      });
    },
    [isAdmin, serverPermissions]
  );

  // Save all changes
  const handleSave = useCallback(async () => {
    if (pendingCount === 0) return;
    setIsSaving(true);
    try {
      const updates: BulkUpdateItem[] = [];
      for (const [key, flags] of Object.entries(overrides)) {
        const [roleStr, actionStr] = key.split('-');
        const roleId = parseInt(roleStr, 10);
        const actionId = parseInt(actionStr, 10);
        updates.push({ role_id: roleId, action_id: actionId, ...flags });
      }
      await rolePermissionService.bulkUpdatePermissions({ updates });
      setOverrides({});
      queryClient.invalidateQueries({ queryKey: ['permissionMatrix'] });
      toast.success(`${updates.length} permission(s) updated successfully`);
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  }, [overrides, pendingCount, queryClient]);

  // Reset
  const handleReset = useCallback(() => {
    setOverrides({});
  }, []);

  // Toggle module expansion
  const toggleModule = useCallback((moduleId: number) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  // Expand all
  const expandAll = useCallback(() => {
    setExpandedModules(new Set(modules.map(m => m.id)));
  }, [modules]);

  // Role stats
  const roleStats = useMemo(() => {
    const stats: Record<number, { total: number; granted: number }> = {};
    roles.forEach(r => {
      stats[r.id] = { total: 0, granted: 0 };
    });

    modules.forEach(mod => {
      mod.pages.forEach(page => {
        page.actions.forEach(action => {
          roles.forEach(role => {
            const perm = getPermission(role.id, action.id);
            stats[role.id].total += PERM_FLAGS.length;
            stats[role.id].granted += PERM_FLAGS.filter(f => perm[f]).length;
          });
        });
      });
    });
    return stats;
  }, [modules, roles, getPermission]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-gray-600">Loading permission matrix…</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900">Failed to load permissions</h3>
          <p className="text-sm text-gray-500 mt-1">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900">Access Restricted</h3>
          <p className="text-sm text-gray-500 mt-1">
            Only administrators can manage the permissions matrix.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            Roles &amp; Permissions Matrix
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage granular permissions for each role across all modules, pages, and actions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 text-sm mr-2">
              <AlertTriangle className="w-4 h-4" />
              {pendingCount} unsaved change{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={expandAll}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Expand All
          </button>
          <button
            onClick={handleReset}
            disabled={pendingCount === 0 || isSaving}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={pendingCount === 0 || isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Role Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {roles.map(role => {
          const s = roleStats[role.id];
          const pct = s && s.total > 0 ? Math.round((s.granted / s.total) * 100) : 0;
          return (
            <div key={role.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{role.name}</h3>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    pct > 70
                      ? 'bg-green-100 text-green-700'
                      : pct > 40
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {pct}%
                </span>
              </div>
              {role.description && (
                <p className="text-xs text-gray-500 truncate">{role.description}</p>
              )}
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct > 70 ? 'bg-green-500' : pct > 40 ? 'bg-amber-500' : 'bg-gray-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {s?.granted ?? 0} of {s?.total ?? 0} flags
              </p>
            </div>
          );
        })}
      </div>

      {/* Matrix by Modules */}
      <div className="space-y-3">
        {modules.map(mod => {
          const isExpanded = expandedModules.has(mod.id);
          return (
            <div key={mod.id} className="bg-white border rounded-lg overflow-hidden">
              {/* Module Header */}
              <button
                onClick={() => toggleModule(mod.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="font-semibold text-gray-900">{mod.name}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {mod.pages.length} page{mod.pages.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>

              {/* Module Content */}
              {isExpanded && (
                <div className="border-t overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-4 py-2 font-medium text-gray-600 min-w-[200px]">
                          Page / Action
                        </th>
                        {roles.map(role => (
                          <th
                            key={role.id}
                            colSpan={PERM_FLAGS.length}
                            className="text-center px-2 py-2 font-medium text-gray-600 border-l"
                          >
                            {role.name}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50 border-b">
                        <th />
                        {roles.map(role => (
                          <React.Fragment key={role.id}>
                            {PERM_FLAGS.map(flag => (
                              <th
                                key={`${role.id}-${flag}`}
                                className="text-center px-1 py-1 text-xs font-normal text-gray-500 border-l first:border-l"
                                title={FLAG_LABELS[flag]}
                              >
                                {FLAG_LABELS[flag].charAt(0)}
                              </th>
                            ))}
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mod.pages.map(page => (
                        <React.Fragment key={page.id}>
                          {/* Page grouping row */}
                          <tr className="bg-blue-50/40">
                            <td
                              className="px-4 py-2 font-medium text-gray-800"
                              colSpan={1 + roles.length * PERM_FLAGS.length}
                            >
                              {page.title}
                            </td>
                          </tr>
                          {/* Action rows */}
                          {page.actions.map(action => (
                            <tr key={action.id} className="border-b hover:bg-gray-50">
                              <td className="px-4 py-1.5 pl-8 text-gray-600">
                                {action.name}
                                <span className="ml-1 text-xs text-gray-400">({action.code})</span>
                              </td>
                              {roles.map(role => {
                                const perm = getPermission(role.id, action.id);
                                const key = `${role.id}-${action.id}`;
                                return (
                                  <React.Fragment key={role.id}>
                                    {PERM_FLAGS.map(flag => {
                                      const isOn = perm[flag];
                                      const colors = FLAG_COLORS[flag];
                                      const isOverridden = overrides[key]?.[flag] !== undefined;
                                      return (
                                        <td
                                          key={`${key}-${flag}`}
                                          className="text-center px-1 py-1 border-l"
                                        >
                                          <button
                                            onClick={() => toggleFlag(role.id, action.id, flag)}
                                            className={`w-6 h-6 rounded border-2 inline-flex items-center justify-center transition-all ${
                                              isOn ? colors.on : colors.off
                                            } ${
                                              isOverridden
                                                ? 'ring-2 ring-amber-400 ring-offset-1'
                                                : ''
                                            } hover:scale-110`}
                                            title={`${FLAG_LABELS[flag]}: ${isOn ? 'ON' : 'OFF'} — ${role.name} / ${action.name}`}
                                          >
                                            {isOn && <CheckCircle className="w-3.5 h-3.5" />}
                                          </button>
                                        </td>
                                      );
                                    })}
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-3">Legend</h4>
        <div className="flex flex-wrap gap-4 text-xs">
          {PERM_FLAGS.map(flag => (
            <div key={flag} className="flex items-center gap-1.5">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${FLAG_COLORS[flag].on}`}
              >
                <CheckCircle className="w-3 h-3" />
              </div>
              <span>{FLAG_LABELS[flag]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded border-2 bg-gray-100 border-gray-300" />
            <span>No Access</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded border-2 bg-green-100 border-green-500 ring-2 ring-amber-400 ring-offset-1 flex items-center justify-center">
              <CheckCircle className="w-3 h-3 text-green-600" />
            </div>
            <span>Pending Change</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RolesPermissionsMatrixPage;
