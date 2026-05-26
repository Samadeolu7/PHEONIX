import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Copy, Trash2, Settings, Users, Layout, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardBuilder } from '../../components/dashboard/DashboardBuilder';
import { DashboardTemplate } from '../../types/dashboardTemplates';
import { UserRole } from '../../types/roles';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import rolePermissionService, { RolePermissionPolicy } from '../../services/rolePermissionService';
import { userManagementService, Role } from '../../services/userManagementService';
import toast from 'react-hot-toast';

interface DashboardBuilderPageProps {
  className?: string;
}

/** Modules that a role is allowed to include in their dashboard widgets */
interface RoleModuleAccess {
  permittedModuleCodes: string[];
  permittedPageCodes: string[];
  isLoading: boolean;
}

/** Derive a stable default template when creating fresh */
const buildEmptyTemplate = (): DashboardTemplate => ({
  id: `template-${Date.now()}`,
  name: 'New Dashboard',
  description: 'Custom dashboard template',
  role: 'administrator' as UserRole,
  showWelcomeBanner: true,
  showQuickStats: true,
  showModuleCards: true,
  showActivityFeed: false,
  showAlerts: false,
  primaryModules: [],
  secondaryModules: [],
  statsCards: [],
  quickActions: [],
  widgets: [],
  layout: 'grid',
  maxModulesPerRow: 3,
  showModuleStats: true,
  theme: {
    primaryColor: '#3B82F6',
    backgroundColor: '#F8FAFC',
  },
});

export const DashboardBuilderPage: React.FC<DashboardBuilderPageProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId?: string }>();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null);
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Access grants for the role currently being edited
  const [roleAccess, setRoleAccess] = useState<RoleModuleAccess>({
    permittedModuleCodes: [],
    permittedPageCodes: [],
    isLoading: false,
  });

  // â”€â”€ Load templates from API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get('/dashboards/');
      const items: any[] = Array.isArray(res) ? res : res?.results ?? res?.data ?? [];
      // Only include templates that have a role assigned (dashboard-builder managed)
      setTemplates(items.filter(t => t.role));
    } catch {
      toast.error('Failed to load dashboard templates');
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // â”€â”€ Open builder when templateId is in URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (templateId && templates.length > 0) {
      const template = templates.find(t => String(t.id) === templateId);
      if (template) {
        setSelectedTemplate(template);
        setIsBuilderMode(true);
        fetchRolePermissions(template.role as string);
      } else {
        toast.error('Template not found');
        navigate('/admin/dashboard-builder');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  // â”€â”€ Fetch permitted modules for a given role name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const fetchRolePermissions = useCallback(async (roleName: string) => {
    if (!roleName) return;
    setRoleAccess(prev => ({ ...prev, isLoading: true }));
    try {
      // Get all roles to resolve name â†’ id
      const roles: Role[] = await userManagementService.getRoles();
      const matched = roles.find(
        r => r.name.toLowerCase() === roleName.toLowerCase()
      );
      if (!matched) {
        // Unknown role â€” no restrictions applied (fail-open)
        setRoleAccess({ permittedModuleCodes: [], permittedPageCodes: [], isLoading: false });
        return;
      }

      const policies: RolePermissionPolicy[] = await rolePermissionService.getRolePolicies({
        role: matched.id,
      });

      // Collect module codes and page codes where the role has can_view = true
      const permittedModuleCodes: string[] = [];
      const permittedPageCodes: string[] = [];

      for (const policy of policies) {
        if (!policy.can_view) continue;
        if (policy.module_name) {
          const code = (policy.module_name as string).toLowerCase().replace(/\s+/g, '-');
          if (!permittedModuleCodes.includes(code)) permittedModuleCodes.push(code);
        }
        if (policy.page_title) {
          const code = (policy.page_title as string).toLowerCase().replace(/\s+/g, '-');
          if (!permittedPageCodes.includes(code)) permittedPageCodes.push(code);
        }
      }

      setRoleAccess({ permittedModuleCodes, permittedPageCodes, isLoading: false });
    } catch {
      // On error, do not block the UI â€” but warn the user
      toast.error('Could not load role permissions. Widget filtering is disabled.');
      setRoleAccess({ permittedModuleCodes: [], permittedPageCodes: [], isLoading: false });
    }
  }, []);

  // â”€â”€ Validate that a template only uses modules the role can view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const validateTemplateModules = (template: DashboardTemplate): string[] => {
    const errors: string[] = [];
    const { permittedModuleCodes, permittedPageCodes } = roleAccess;

    // Only validate when we have actual policy data
    if (permittedModuleCodes.length === 0 && permittedPageCodes.length === 0) {
      return errors; // No data = fail-open
    }

    const allPermitted = [...permittedModuleCodes, ...permittedPageCodes];

    for (const mod of template.primaryModules ?? []) {
      if (!allPermitted.some(p => mod.toLowerCase().includes(p) || p.includes(mod.toLowerCase()))) {
        errors.push(`Primary module "${mod}" is not permitted for role "${template.role}"`);
      }
    }
    for (const mod of template.secondaryModules ?? []) {
      if (!allPermitted.some(p => mod.toLowerCase().includes(p) || p.includes(mod.toLowerCase()))) {
        errors.push(`Secondary module "${mod}" is not permitted for role "${template.role}"`);
      }
    }

    return errors;
  };

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleCreateTemplate = () => {
    const newTemplate = buildEmptyTemplate();
    setSelectedTemplate(newTemplate);
    setRoleAccess({ permittedModuleCodes: [], permittedPageCodes: [], isLoading: false });
    setIsBuilderMode(true);
  };

  const handleEditTemplate = (template: DashboardTemplate) => {
    setSelectedTemplate(template);
    setIsBuilderMode(true);
    fetchRolePermissions(template.role as string);
    navigate(`/admin/dashboard-builder/${template.id}`);
  };

  const handleSaveTemplate = async (template: DashboardTemplate) => {
    // Enforce permission compliance before saving
    const validationErrors = validateTemplateModules(template);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      console.warn('Dashboard template validation failed:', validationErrors);
      return;
    }

    setIsLoading(true);
    try {
      const isNew = !templates.some(t => t.id === template.id);
      if (isNew) {
        await api.post('/dashboards/', template);
      } else {
        await api.patch(`/dashboards/${template.id}/`, template);
      }
      await loadTemplates();
      toast.success(isNew ? 'Dashboard template created' : 'Dashboard template updated');
    } catch {
      toast.error('Failed to save dashboard template');
    } finally {
      setIsLoading(false);
      setIsBuilderMode(false);
      setSelectedTemplate(null);
      navigate('/admin/dashboard-builder');
    }
  };

  const handlePreviewTemplate = (template: DashboardTemplate) => {
    console.log('Previewing template:', template.name);
  };

  const handleDuplicateTemplate = async (template: DashboardTemplate) => {
    const duplicated: DashboardTemplate = {
      ...template,
      id: `${template.id}-copy-${Date.now()}`,
      name: `${template.name} (Copy)`,
      widgets: template.widgets?.map(w => ({ ...w, id: `${w.id}-copy-${Date.now()}` })) || [],
    };
    try {
      await api.post('/dashboards/', duplicated);
      await loadTemplates();
      toast.success('Dashboard template duplicated');
    } catch {
      toast.error('Failed to duplicate template');
    }
  };

  const handleDeleteTemplate = async (templateId: string | number) => {
    if (!window.confirm('Are you sure you want to delete this dashboard template?')) return;
    try {
      await api.delete(`/dashboards/${templateId}/`);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      toast.success('Dashboard template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const getRoleColor = (role: UserRole) => {
    const colors: Record<string, string> = {
      director: 'bg-purple-100 text-purple-800',
      principal: 'bg-blue-100 text-blue-800',
      administrator: 'bg-green-100 text-green-800',
      registrar: 'bg-yellow-100 text-yellow-800',
      officer: 'bg-gray-100 text-gray-800',
    };
    return colors[role] || colors.officer;
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (isBuilderMode && selectedTemplate) {
    return (
      <div>
        {/* Permission context banner */}
        {roleAccess.isLoading && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-700 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading permission constraints for roleâ€¦
          </div>
        )}
        {!roleAccess.isLoading && (roleAccess.permittedModuleCodes.length > 0 || roleAccess.permittedPageCodes.length > 0) && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>
              Permission-aware mode: only modules permitted for role <strong>{selectedTemplate.role}</strong> may be added.
              Permitted: {[...roleAccess.permittedModuleCodes, ...roleAccess.permittedPageCodes].join(', ') || 'none detected'}
            </span>
          </div>
        )}
        <DashboardBuilder
          template={selectedTemplate}
          onSave={handleSaveTemplate}
          onPreview={handlePreviewTemplate}
          className={className}
        />
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen bg-gray-50', className)}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Admin</span>
              </button>
              <div className="h-6 w-px bg-gray-300" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Dashboard Builder</h1>
                <p className="text-sm text-gray-600">Create and manage dashboard templates</p>
              </div>
            </div>

            <button
              onClick={handleCreateTemplate}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Template</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Layout className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Templates</p>
                <p className="text-2xl font-bold text-gray-900">{templates.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Roles</p>
                <p className="text-2xl font-bold text-gray-900">
                  {new Set(templates.map(t => t.role)).size}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Settings className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Widgets</p>
                <p className="text-2xl font-bold text-gray-900">
                  {templates.reduce((sum, t) => sum + (t.widgets?.length || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Dashboard Templates</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage dashboard layouts for different user roles â€” each template is permission-validated against the role&apos;s access rights.
            </p>
          </div>

          <div className="p-6">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading templatesâ€¦</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <Layout className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
                <p className="text-gray-600 mb-6">
                  Create your first dashboard template to get started
                </p>
                <button
                  onClick={handleCreateTemplate}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Template</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-1">{template.name}</h3>
                        <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            getRoleColor(template.role)
                          )}
                        >
                          {template.role}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span>{template.widgets?.length || 0} widgets</span>
                      <span>{template.layout} layout</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditTemplate(template)}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicateTemplate(template)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardBuilderPage;
