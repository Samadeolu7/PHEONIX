// src/pages/settings/PagesActionsSettingsPage.tsx
import React, { useState, useMemo, useEffect } from 'react';
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
  ExternalLink,
  FileText,
  Calculator,
  BarChart3,
  Users,
  Package,
  Home,
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
} from 'lucide-react';
import { usePermissionMatrix, useBulkUpdatePermissions } from '../../hooks/useRolePermissions';
import { PermissionFlags } from '../../services/rolePermissionService';
import api from '@/services/api';
import { Link } from 'react-router-dom';
import { modulesData } from '@/config/permissionModules';

// ----- Types (same as before) -----
interface PageAction {
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

interface PageInfo {
  id: string;
  name: string;
  path: string;
  description: string;
  actions: PageAction[];
}

interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  pages: PageInfo[];
}

// ----- Role type from backend -----
interface Role {
  id: number;
  name: string;
  description: string;
  permissions: any[]; // This exists in response
  permission_details: any[]; // This exists in response
  default_dashboard: any | null;
  can_access_dashboards: any[];
  can_access_modules: any[];
  can_access_pages: any[];
  permission_codes: string[]; // This is the important one!
  is_active: boolean;
  user_count: number;
  created_at: string;
  updated_at: string;
}
// ----- Your existing modulesData (keep exactly as before) -----

const PagesActionsSettingsPage: React.FC = () => {
  // ----- Hooks -----
  const { data, isLoading, error } = usePermissionMatrix();
  const bulkUpdateMutation = useBulkUpdatePermissions();

  // ----- Local state -----
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedActionType, setSelectedActionType] = useState<string>('all');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  // New state for roles and permissions
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);
  // ----- Fetch all roles on mount -----
  useEffect(() => {
    const fetchRoles = async () => {
      setLoadingRoles(true);
      try {
        const response = await api.get('/users/roles/');
        console.log('🔵 ROLES LIST - Full response object:', response);

        // The response itself IS the data - it has count, next, previous, results
        const rolesData = response.results || [];
        console.log('🔵 ROLES LIST - Extracted rolesData:', rolesData);

        setRoles(rolesData);

        if (rolesData.length > 0 && !selectedRoleId) {
          setSelectedRoleId(rolesData[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch roles:', error);
      } finally {
        setLoadingRoles(false);
      }
    };
    fetchRoles();
  }, []);

  // ----- Fetch selected role's permissions when role changes -----
  useEffect(() => {
    if (!selectedRoleId) return;

    const fetchRolePermissions = async () => {
      try {
        const response = await api.get(`/users/roles/${selectedRoleId}/`);
        console.log('🟢 ROLE DETAIL - Full response object:', response);

        // The response itself IS the role object
        setRolePermissions(response.permission_codes || []);
        console.log('🟢 ROLE DETAIL - Set permissions:', response.permission_codes);
      } catch (error) {
        console.error('Failed to fetch role permissions:', error);
      }
    };

    fetchRolePermissions();
  }, [selectedRoleId]);

  // ----- Save permissions for the selected role -----
  const handleSave = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const response = await api.patch(`/users/roles/${selectedRoleId}/`, {
        permission_codes: rolePermissions,
      });
      console.log('🟢 SAVE response:', response);

      // Refresh roles list to update permission counts
      const rolesRes = await api.get('/users/roles/');
      setRoles(rolesRes.results || []);

      // Update current role permissions from response
      if (response.permission_codes) {
        setRolePermissions(response.permission_codes);
      }

      alert('Permissions updated successfully!');
    } catch (error) {
      console.error('Failed to save permissions:', error);
      alert('Error saving permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  // ----- Filter modules based on search term (unchanged) -----
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
  }, [searchTerm]);

  // ----- Expand/collapse handlers (unchanged) -----
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

  // Add these helper functions inside your component, before the return statement

  // Helper to get all permission codes for a specific module
  const getModulePermissionCodes = (moduleId: string): string[] => {
    const module = modulesData.find(m => m.id === moduleId);
    if (!module) return [];

    return module.pages.flatMap(page => page.actions.map(action => action.id));
  };

  // Helper to get all permission codes for a specific page
  const getPagePermissionCodes = (pageId: string): string[] => {
    for (const module of modulesData) {
      const page = module.pages.find(p => p.id === pageId);
      if (page) {
        return page.actions.map(action => action.id);
      }
    }
    return [];
  };

  // Handler for selecting/deselecting all permissions in a module
  const handleModuleSelectAll = (moduleId: string, select: boolean) => {
    const moduleCodes = getModulePermissionCodes(moduleId);

    setRolePermissions(prev => {
      if (select) {
        // Add all module codes that aren't already selected
        const newPermissions = new Set([...prev, ...moduleCodes]);
        return Array.from(newPermissions);
      } else {
        // Remove all module codes
        return prev.filter(code => !moduleCodes.includes(code));
      }
    });
  };

  // Handler for selecting/deselecting all permissions in a page
  const handlePageSelectAll = (pageId: string, select: boolean) => {
    const pageCodes = getPagePermissionCodes(pageId);

    setRolePermissions(prev => {
      if (select) {
        // Add all page codes that aren't already selected
        const newPermissions = new Set([...prev, ...pageCodes]);
        return Array.from(newPermissions);
      } else {
        // Remove all page codes
        return prev.filter(code => !pageCodes.includes(code));
      }
    });
  };

  // Check if all permissions in a module are selected
  const isModuleFullySelected = (moduleId: string): boolean => {
    const moduleCodes = getModulePermissionCodes(moduleId);
    if (moduleCodes.length === 0) return false;

    return moduleCodes.every(code => rolePermissions.includes(code));
  };

  // Check if some (but not all) permissions in a module are selected
  const isModulePartiallySelected = (moduleId: string): boolean => {
    const moduleCodes = getModulePermissionCodes(moduleId);
    if (moduleCodes.length === 0) return false;

    const selectedCount = moduleCodes.filter(code => rolePermissions.includes(code)).length;
    return selectedCount > 0 && selectedCount < moduleCodes.length;
  };

  // Check if all permissions in a page are selected
  const isPageFullySelected = (pageId: string): boolean => {
    const pageCodes = getPagePermissionCodes(pageId);
    if (pageCodes.length === 0) return false;

    return pageCodes.every(code => rolePermissions.includes(code));
  };

  // Check if some (but not all) permissions in a page are selected
  const isPagePartiallySelected = (pageId: string): boolean => {
    const pageCodes = getPagePermissionCodes(pageId);
    if (pageCodes.length === 0) return false;

    const selectedCount = pageCodes.filter(code => rolePermissions.includes(code)).length;
    return selectedCount > 0 && selectedCount < pageCodes.length;
  };

  // ----- Action type color helper (unchanged) -----
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

  // ----- Available action types filter (unchanged) -----
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

  // ----- Loading state -----
  if (loadingRoles) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-gray-600">Loading roles...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Role Permission Editor</h1>
          <p className="text-gray-600">
            Select a role and toggle permissions for each action. Changes are saved to the backend.
          </p>
        </div>
        {/* Role Selector and Save Button */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-3">Select Role</h2>
              <div className="flex flex-wrap gap-2">
                {roles.map(role => (
                  <button
                    key={role.id}
                    onClick={() => !saving && setSelectedRoleId(role.id)} // Disable click when saving
                    disabled={saving} // Disable the button when saving
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedRoleId === role.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`} // Add visual feedback when disabled
                  >
                    {role.name}
                    <span className="ml-2 text-xs opacity-75">
                      ({role.permission_codes?.length || 0})
                    </span>
                  </button>
                ))}
              </div>
              {saving && (
                <p className="text-xs text-blue-600 mt-2">
                  ⏳ Saving permissions... Role selection is disabled
                </p>
              )}
            </div>
            <div className="flex items-center">
              <button
                onClick={handleSave}
                disabled={saving || !selectedRoleId}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Permissions
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search pages or actions..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Module Filter */}
            <div>
              <select
                value={selectedModule}
                onChange={e => setSelectedModule(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Modules</option>
                {modulesData.map(module => (
                  <option key={module.id} value={module.id}>
                    {module.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Type Filter */}
            <div>
              <select
                value={selectedActionType}
                onChange={e => setSelectedActionType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {actionTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'all'
                      ? 'All Action Types'
                      : type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Modules List */}
        <div className="space-y-4">
          {filteredModules.map(module => (
            <div key={module.id} className="bg-white rounded-lg shadow-sm border">
              {/* Module Header */}
              <div
                className="p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleModule(module.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {expandedModules.has(module.id) ? (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{module.name}</h3>
                      <p className="text-sm text-gray-600">{module.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {/* Module Select All Checkbox */}
                    <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
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
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">Select All</span>
                    </div>
                    <div className="text-sm text-gray-500">{module.pages.length} pages</div>
                  </div>
                </div>
              </div>

              {/* Module Content */}
              {expandedModules.has(module.id) && (
                <div className="p-4">
                  <div className="space-y-4">
                    {module.pages.map(page => (
                      <div key={page.id} className="border rounded-lg">
                        {/* Page Header */}
                        <div
                          className="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => togglePage(page.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {expandedPages.has(page.id) ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                              <div>
                                <h4 className="font-medium text-gray-900">{page.name}</h4>
                                <p className="text-xs text-gray-600">{page.path}</p>
                                <p className="text-xs text-gray-500 mt-1">{page.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              {/* Page Select All Checkbox */}
                              <div
                                className="flex items-center space-x-2"
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
                                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-600">Select All</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {page.actions.length} actions
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Page Actions */}
                        {expandedPages.has(page.id) && (
                          <div className="p-3 border-t">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {page.actions
                                .filter(
                                  action =>
                                    selectedActionType === 'all' ||
                                    action.type === selectedActionType
                                )
                                .map(action => {
                                  const isChecked = rolePermissions.includes(action.id);
                                  // Add this debug for first few actions
                                  if (action.id === 'po-list' || action.id === 'po-bulk-approve') {
                                    console.log(`🟡 Action ${action.id}:`, {
                                      isChecked,
                                      rolePermissions,
                                      includes: rolePermissions.includes(action.id),
                                    });
                                  }

                                  const handleToggle = () => {
                                    setRolePermissions(prev =>
                                      isChecked
                                        ? prev.filter(code => code !== action.id)
                                        : [...prev, action.id]
                                    );
                                  };
                                  const Icon = action.icon;

                                  return (
                                    <div
                                      key={action.id}
                                      className={`border rounded-lg p-3 transition-shadow ${
                                        isChecked ? 'border-blue-300 bg-blue-50' : 'hover:shadow-sm'
                                      }`}
                                    >
                                      <label className="flex items-start space-x-3 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={handleToggle}
                                          disabled={saving} // Add this line
                                          className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center space-x-2 mb-1">
                                            <Icon className="h-4 w-4 text-gray-600 flex-shrink-0" />
                                            <span className="text-sm font-medium text-gray-900 truncate">
                                              {action.name}
                                            </span>
                                            <span
                                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${getActionTypeColor(action.type)}`}
                                            >
                                              {action.type}
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-600 mb-2">
                                            {action.description}
                                          </p>
                                          {action.apiEndpoint && (
                                            <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 block truncate">
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

        {/* Summary Stats */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{filteredModules.length}</div>
              <div className="text-sm text-gray-600">Filtered Modules</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {filteredModules.reduce((sum, module) => sum + module.pages.length, 0)}
              </div>
              <div className="text-sm text-gray-600">Filtered Pages</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {filteredModules.reduce(
                  (sum, module) =>
                    sum + module.pages.reduce((pageSum, page) => pageSum + page.actions.length, 0),
                  0
                )}
              </div>
              <div className="text-sm text-gray-600">Filtered Actions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {
                  new Set(
                    filteredModules.flatMap(module =>
                      module.pages.flatMap(page =>
                        page.actions
                          .filter(action => action.apiEndpoint)
                          .map(action => action.apiEndpoint)
                      )
                    )
                  ).size
                }
              </div>
              <div className="text-sm text-gray-600">Unique Endpoints</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PagesActionsSettingsPage;
