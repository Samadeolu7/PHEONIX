// src/components/admin/PermissionEditor.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Eye,
  Edit,
  Plus,
  Trash2,
  Check,
  X,
  Download,
  Upload,
  Send,
  Settings,
  ChevronDown,
  ChevronRight,
  FileText,
  Calculator,
  BarChart3,
  Users,
  Package,
  ShoppingCart,
  RotateCcw,
  Building,
  Boxes,
  TrendingUp,
  CheckSquare,
  AlertCircle,
  AlertTriangle,
  Calendar,
  DollarSign,
  Truck,
  ClipboardList,
  PieChart,
  Receipt,
  CreditCard,
  Target,
  GraduationCap,
  Clock,
  Tag,
  Activity,
  Folder,
  Trash,
  Save,
  CheckCircle,
  Printer,
  Quote,
  Scale,
  XCircle,
  Home,
  ExternalLink,
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/hooks/useToast';

// ============================================================================
// Types
// ============================================================================

export interface PageAction {
  id: string;
  name: string;
  type:
    | 'view'
    | 'create'
    | 'edit'
    | 'delete'
    | 'approve'
    | 'reject'
    | 'export'
    | 'import'
    | 'send'
    | 'navigate'
    | 'process';
  description: string;
  apiEndpoint?: string;
  requiresPermission?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface PageInfo {
  id: string;
  name: string;
  path: string;
  description: string;
  actions: PageAction[];
}

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  pages: PageInfo[];
}

export interface Role {
  id: number;
  name: string;
  description: string;
  permissions: any[];
  permission_details: any[];
  default_dashboard: any | null;
  can_access_dashboards: any[];
  can_access_modules: any[];
  can_access_pages: any[];
  permission_codes: string[];
  is_active: boolean;
  user_count: number;
  created_at: string;
  updated_at: string;
}

interface PermissionEditorProps {
  modulesData: ModuleInfo[];
  /** When provided, the editor is externally controlled — role selector is hidden
   *  and this roleId is used directly. The editor re-fetches when it changes. */
  controlledRoleId?: number | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

const getActionTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    view: 'bg-blue-100 text-blue-800',
    create: 'bg-green-100 text-green-800',
    edit: 'bg-yellow-100 text-yellow-800',
    delete: 'bg-red-100 text-red-800',
    approve: 'bg-emerald-100 text-emerald-800',
    reject: 'bg-red-100 text-red-800',
    export: 'bg-purple-100 text-purple-800',
    import: 'bg-indigo-100 text-indigo-800',
    send: 'bg-cyan-100 text-cyan-800',
    navigate: 'bg-gray-100 text-gray-800',
    process: 'bg-orange-100 text-orange-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
};

// ============================================================================
// Component
// ============================================================================

export const PermissionEditor: React.FC<PermissionEditorProps> = ({ modulesData, controlledRoleId }) => {
  const toast = useToast();

  const isControlled = controlledRoleId !== undefined;

  // State
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedActionType, setSelectedActionType] = useState<string>('all');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  const actionTypes = [
    'all',
    'view',
    'create',
    'edit',
    'delete',
    'approve',
    'reject',
    'export',
    'import',
    'send',
    'process',
  ];

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  // The effective role: externally controlled takes priority over internal selection
  const effectiveRoleId = isControlled ? (controlledRoleId ?? null) : selectedRoleId;

  useEffect(() => {
    if (!isControlled) fetchRoles();
  }, [isControlled]);

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const response = await api.get('/users/roles/');
      const rolesData = response.results || [];
      setRoles(rolesData);

      if (rolesData.length > 0 && !selectedRoleId) {
        setSelectedRoleId(rolesData[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      toast.error('Failed to load roles');
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    if (!effectiveRoleId) return;

    const fetchRolePermissions = async () => {
      try {
        const response = await api.get(`/users/roles/${effectiveRoleId}/`);
        setRolePermissions(response.permission_codes || []);
      } catch (error) {
        console.error('Failed to fetch role permissions:', error);
        toast.error('Failed to load role permissions');
      }
    };

    fetchRolePermissions();
  }, [effectiveRoleId]);

  // ==========================================================================
  // Permission Helpers
  // ==========================================================================

  const getModulePermissionCodes = (moduleId: string): string[] => {
    const module = modulesData.find(m => m.id === moduleId);
    if (!module) return [];
    return module.pages.flatMap(page => page.actions.map(action => action.id));
  };

  const getPagePermissionCodes = (pageId: string): string[] => {
    for (const module of modulesData) {
      const page = module.pages.find(p => p.id === pageId);
      if (page) {
        return page.actions.map(action => action.id);
      }
    }
    return [];
  };

  const handleModuleSelectAll = (moduleId: string, select: boolean) => {
    const moduleCodes = getModulePermissionCodes(moduleId);
    setRolePermissions(prev => {
      if (select) {
        return Array.from(new Set([...prev, ...moduleCodes]));
      } else {
        return prev.filter(code => !moduleCodes.includes(code));
      }
    });
  };

  const handlePageSelectAll = (pageId: string, select: boolean) => {
    const pageCodes = getPagePermissionCodes(pageId);
    setRolePermissions(prev => {
      if (select) {
        return Array.from(new Set([...prev, ...pageCodes]));
      } else {
        return prev.filter(code => !pageCodes.includes(code));
      }
    });
  };

  const isModuleFullySelected = (moduleId: string): boolean => {
    const moduleCodes = getModulePermissionCodes(moduleId);
    if (moduleCodes.length === 0) return false;
    return moduleCodes.every(code => rolePermissions.includes(code));
  };

  const isModulePartiallySelected = (moduleId: string): boolean => {
    const moduleCodes = getModulePermissionCodes(moduleId);
    if (moduleCodes.length === 0) return false;
    const selectedCount = moduleCodes.filter(code => rolePermissions.includes(code)).length;
    return selectedCount > 0 && selectedCount < moduleCodes.length;
  };

  const isPageFullySelected = (pageId: string): boolean => {
    const pageCodes = getPagePermissionCodes(pageId);
    if (pageCodes.length === 0) return false;
    return pageCodes.every(code => rolePermissions.includes(code));
  };

  const isPagePartiallySelected = (pageId: string): boolean => {
    const pageCodes = getPagePermissionCodes(pageId);
    if (pageCodes.length === 0) return false;
    const selectedCount = pageCodes.filter(code => rolePermissions.includes(code)).length;
    return selectedCount > 0 && selectedCount < pageCodes.length;
  };

  // ==========================================================================
  // Filtering
  // ==========================================================================

  const filteredModules = useMemo(() => {
    if (!searchTerm) return modulesData;
    return modulesData
      .map(module => ({
        ...module,
        pages: module.pages.filter(
          page =>
            page.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            page.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            page.actions.some(
              action =>
                action.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                action.description.toLowerCase().includes(searchTerm.toLowerCase())
            )
        ),
      }))
      .filter(module => module.pages.length > 0);
  }, [searchTerm, modulesData]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSave = async () => {
    if (!effectiveRoleId) return;
    setSaving(true);
    try {
      const response = await api.patch(`/users/roles/${effectiveRoleId}/`, {
        permission_codes: rolePermissions,
      });

      // Refresh roles list to update permission counts
      const rolesRes = await api.get('/users/roles/');
      setRoles(rolesRes.results || []);

      if (response.permission_codes) {
        setRolePermissions(response.permission_codes);
      }

      toast.success('Permissions updated successfully!');
    } catch (error) {
      console.error('Failed to save permissions:', error);
      toast.error('Error saving permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) newExpanded.delete(moduleId);
    else newExpanded.add(moduleId);
    setExpandedModules(newExpanded);
  };

  const togglePage = (pageId: string) => {
    const newExpanded = new Set(expandedPages);
    if (newExpanded.has(pageId)) newExpanded.delete(pageId);
    else newExpanded.add(pageId);
    setExpandedPages(newExpanded);
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  if (loadingRoles && !isControlled) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ color: '#6b7280' }}>Loading roles...</div>
      </div>
    );
  }

  if (isControlled && !effectiveRoleId) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
        Select a role from the sidebar to configure its action permissions.
      </div>
    );
  }

  return (
    <div>
      {/* Role Selector — only shown in standalone (non-controlled) mode */}
      {!isControlled && (
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Select Role
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => !saving && setSelectedRoleId(role.id)}
                  disabled={saving}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    border: 'none',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1,
                    backgroundColor: selectedRoleId === role.id ? '#3b82f6' : '#f3f4f6',
                    color: selectedRoleId === role.id ? 'white' : '#374151',
                  }}
                >
                  {role.name}
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.75 }}>
                    ({role.permission_codes?.length || 0})
                  </span>
                </button>
              ))}
            </div>
            {saving && (
              <p style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.5rem' }}>
                ⏳ Saving permissions... Role selection is disabled
              </p>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSave}
              disabled={saving || !effectiveRoleId}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: saving || !effectiveRoleId ? 'not-allowed' : 'pointer',
                opacity: saving || !effectiveRoleId ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 500,
              }}
            >
              <Save style={{ width: '1rem', height: '1rem' }} />
              {saving ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Filters */}
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
                width: '1rem',
                height: '1rem',
              }}
            />
            <input
              type="text"
              placeholder="Search pages or actions..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '2.5rem',
                paddingRight: '0.75rem',
                paddingTop: '0.5rem',
                paddingBottom: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>

          {/* Module Filter */}
          <select
            value={selectedModule}
            onChange={e => setSelectedModule(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
            }}
          >
            <option value="all">All Modules</option>
            {modulesData.map(module => (
              <option key={module.id} value={module.id}>
                {module.name}
              </option>
            ))}
          </select>

          {/* Action Type Filter */}
          <select
            value={selectedActionType}
            onChange={e => setSelectedActionType(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
            }}
          >
            {actionTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? 'All Action Types' : type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Modules List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Save button shown inline when editor is controlled (no external role selector) */}
      {isControlled && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button
            onClick={handleSave}
            disabled={saving || !effectiveRoleId}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: saving || !effectiveRoleId ? 'not-allowed' : 'pointer',
              opacity: saving || !effectiveRoleId ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            <Save style={{ width: '1rem', height: '1rem' }} />
            {saving ? 'Saving…' : 'Save Action Permissions'}
          </button>
        </div>
      )}

      {filteredModules.map(module => (
          <div
            key={module.id}
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            {/* Module Header */}
            <div
              onClick={() => toggleModule(module.id)}
              style={{
                padding: '1rem',
                borderBottom: '1px solid #e5e7eb',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {expandedModules.has(module.id) ? (
                  <ChevronDown style={{ width: '1.25rem', height: '1.25rem', color: '#9ca3af' }} />
                ) : (
                  <ChevronRight style={{ width: '1.25rem', height: '1.25rem', color: '#9ca3af' }} />
                )}
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
                    {module.name}
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>{module.description}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isModuleFullySelected(module.id)}
                    disabled={saving}
                    ref={input => {
                      if (input) {
                        input.indeterminate = isModulePartiallySelected(module.id);
                      }
                    }}
                    onChange={e => {
                      e.stopPropagation();
                      handleModuleSelectAll(module.id, e.target.checked);
                    }}
                    style={{ width: '1rem', height: '1rem' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>Select All</span>
                </div>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {module.pages.length} pages
                </span>
              </div>
            </div>

            {/* Module Content */}
            {expandedModules.has(module.id) && (
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {module.pages.map(page => (
                    <div
                      key={page.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Page Header */}
                      <div
                        onClick={() => togglePage(page.id)}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: '#f9fafb',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {expandedPages.has(page.id) ? (
                            <ChevronDown
                              style={{ width: '1rem', height: '1rem', color: '#9ca3af' }}
                            />
                          ) : (
                            <ChevronRight
                              style={{ width: '1rem', height: '1rem', color: '#9ca3af' }}
                            />
                          )}
                          <div>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                              {page.name}
                            </h4>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{page.path}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isPageFullySelected(page.id)}
                              disabled={saving}
                              ref={input => {
                                if (input) {
                                  input.indeterminate = isPagePartiallySelected(page.id);
                                }
                              }}
                              onChange={e => {
                                e.stopPropagation();
                                handlePageSelectAll(page.id, e.target.checked);
                              }}
                              style={{ width: '0.875rem', height: '0.875rem' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                              Select All
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {page.actions.length} actions
                          </span>
                        </div>
                      </div>

                      {/* Page Actions */}
                      {expandedPages.has(page.id) && (
                        <div style={{ padding: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                              gap: '0.75rem',
                            }}
                          >
                            {page.actions
                              .filter(
                                action =>
                                  selectedActionType === 'all' || action.type === selectedActionType
                              )
                              .map(action => {
                                const isChecked = rolePermissions.includes(action.id);
                                const Icon = action.icon;

                                return (
                                  <div
                                    key={action.id}
                                    style={{
                                      border: '1px solid #e5e7eb',
                                      borderRadius: '0.375rem',
                                      padding: '0.75rem',
                                      backgroundColor: isChecked ? '#eff6ff' : 'white',
                                      transition: 'box-shadow 0.2s',
                                    }}
                                  >
                                    <label
                                      style={{ display: 'flex', gap: '0.75rem', cursor: 'pointer' }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          setRolePermissions(prev =>
                                            isChecked
                                              ? prev.filter(code => code !== action.id)
                                              : [...prev, action.id]
                                          );
                                        }}
                                        disabled={saving}
                                        style={{
                                          marginTop: '0.125rem',
                                          width: '1rem',
                                          height: '1rem',
                                        }}
                                      />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            marginBottom: '0.25rem',
                                          }}
                                        >
                                          <Icon
                                            style={{
                                              width: '1rem',
                                              height: '1rem',
                                              color: '#4b5563',
                                              flexShrink: 0,
                                            }}
                                          />
                                          <span
                                            style={{
                                              fontSize: '0.875rem',
                                              fontWeight: 500,
                                              color: '#111827',
                                            }}
                                          >
                                            {action.name}
                                          </span>
                                          <span
                                            style={{
                                              padding: '0.125rem 0.375rem',
                                              fontSize: '0.625rem',
                                              fontWeight: 500,
                                              borderRadius: '9999px',
                                              ...getActionTypeColor(action.type)
                                                .split(' ')
                                                .reduce((acc, cls) => {
                                                  if (cls.startsWith('bg-'))
                                                    acc.backgroundColor = cls.replace('bg-', '');
                                                  if (cls.startsWith('text-'))
                                                    acc.color = cls.replace('text-', '');
                                                  return acc;
                                                }, {} as any),
                                            }}
                                          >
                                            {action.type}
                                          </span>
                                        </div>
                                        <p
                                          style={{
                                            fontSize: '0.75rem',
                                            color: '#4b5563',
                                            marginBottom: '0.25rem',
                                          }}
                                        >
                                          {action.description}
                                        </p>
                                        {action.apiEndpoint && (
                                          <code
                                            style={{
                                              fontSize: '0.625rem',
                                              backgroundColor: '#f3f4f6',
                                              padding: '0.125rem 0.375rem',
                                              borderRadius: '0.25rem',
                                              color: '#374151',
                                              display: 'block',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {action.apiEndpoint}
                                          </code>
                                        )}
                                      </div>
                                    </label>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
