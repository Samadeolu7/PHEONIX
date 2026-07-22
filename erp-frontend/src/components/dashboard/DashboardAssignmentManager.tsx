// Dashboard Assignment Manager - Main admin interface for managing dashboard assignments
import React, { useState, useCallback, lazy, Suspense } from 'react';
import {
  Users,
  Settings,
  Activity,
  Plus,
  Edit,
  Trash2,
  Eye,
  Power,
  PowerOff,
  Star,
  StarOff,
  History,
  BarChart3,
  Filter,
  Download,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserRole } from '../../types/roles';
import {
  DashboardAssignment,
  DashboardAssignmentManagerProps,
} from '../../types/dashboardAssignment';
import { dashboardAssignmentService } from '../../services/dashboardAssignmentService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
const RoleAssignmentPanel = lazy(() => import('./RoleAssignmentPanel'));
const DashboardVersionManager = lazy(() => import('./DashboardVersionManager'));
const DashboardAnalyticsDashboard = lazy(() => import('./DashboardAnalyticsDashboard'));
const AssignmentHistoryPanel = lazy(() => import('./AssignmentHistoryPanel'));

export const DashboardAssignmentManager: React.FC<DashboardAssignmentManagerProps> = ({
  className = '',
  onAssignmentChange,
}) => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'assignments' | 'versions' | 'analytics' | 'history'>(
    'assignments'
  );
  const [showRolePanel, setShowRolePanel] = useState(false);
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<DashboardAssignment | null>(null);
  const [filters, setFilters] = useState<{ roles?: string[]; templates?: string[]; isActive?: boolean }>({});
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const { data: assignments = [], isLoading, error: queryError } = useQuery({
    queryKey: ['dashboard', 'assignments'],
    queryFn: async () => {
      return dashboardAssignmentService.getAllAssignments();
    },
  });

  const { data: assignmentHistory = [] } = useQuery({
    queryKey: ['dashboard', 'assignments', 'history'],
    queryFn: async () => {
      return dashboardAssignmentService.getAssignmentHistory();
    },
  });

  const activateMutation = useMutation({
    mutationFn: (assignmentId: string) => dashboardAssignmentService.activateAssignment(assignmentId, 'current-admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'assignments'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (assignmentId: string) => dashboardAssignmentService.deactivateAssignment(assignmentId, 'current-admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'assignments'] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (assignmentId: string) => dashboardAssignmentService.setDefaultAssignment(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'assignments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ roleId, templateId }: { roleId: string; templateId: string }) =>
      dashboardAssignmentService.unassignDashboardFromRole(roleId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'assignments'] });
    },
  });

  const handleActivateAssignment = useCallback(
    async (assignmentId: string) => {
      await activateMutation.mutateAsync(assignmentId);
      onAssignmentChange?.(assignments.find(a => a.id === assignmentId)!);
    },
    [activateMutation, assignments, onAssignmentChange]
  );

  const handleDeactivateAssignment = useCallback(
    async (assignmentId: string) => {
      await deactivateMutation.mutateAsync(assignmentId);
      onAssignmentChange?.(assignments.find(a => a.id === assignmentId)!);
    },
    [deactivateMutation, assignments, onAssignmentChange]
  );

  const handleSetDefaultAssignment = useCallback(
    async (assignmentId: string) => {
      await setDefaultMutation.mutateAsync(assignmentId);
      onAssignmentChange?.(assignments.find(a => a.id === assignmentId)!);
    },
    [setDefaultMutation, assignments, onAssignmentChange]
  );

  const handleDeleteAssignment = useCallback(
    async (assignment: DashboardAssignment) => {
      if (!confirm(`Are you sure you want to delete the assignment for ${assignment.roleId}?`)) {
        return;
      }
      await deleteMutation.mutateAsync({ roleId: assignment.roleId, templateId: assignment.templateId });
    },
    [deleteMutation]
  );

  const filteredAssignments = assignments.filter(assignment => {
    if (filters.roles && !filters.roles.includes(assignment.roleId)) {
      return false;
    }
    if (filters.templates && !filters.templates.includes(assignment.templateId)) {
      return false;
    }
    if (filters.isActive !== undefined && assignment.isActive !== filters.isActive) {
      return false;
    }
    return true;
  });

  const roleStats = React.useMemo(() => {
    const stats = {
      total: assignments.length,
      active: assignments.filter(a => a.isActive).length,
      inactive: assignments.filter(a => !a.isActive).length,
      byRole: {} as Record<UserRole, number>,
    };

    assignments.forEach(assignment => {
      stats.byRole[assignment.roleId] = (stats.byRole[assignment.roleId] || 0) + 1;
    });

    return stats;
  }, [assignments]);

  const error = queryError?.message || null;

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-64', className)}>
        <div className="flex items-center space-x-2 text-gray-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading dashboard assignments...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-lg border border-gray-200', className)}>
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Dashboard Assignment Manager</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage dashboard assignments, versions, and analytics for user roles
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowRolePanel(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Assignment</span>
            </button>
            <button
              onClick={() => setShowVersionManager(true)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Settings className="h-4 w-4" />
              <span>Manage Versions</span>
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-blue-900">Total Assignments</p>
                <p className="text-2xl font-bold text-blue-600">{roleStats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center">
              <Power className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-green-900">Active</p>
                <p className="text-2xl font-bold text-green-600">{roleStats.active}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center">
              <PowerOff className="h-8 w-8 text-gray-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">Inactive</p>
                <p className="text-2xl font-bold text-gray-600">{roleStats.inactive}</p>
              </div>
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-purple-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-purple-900">Roles Covered</p>
                <p className="text-2xl font-bold text-purple-600">
                  {Object.keys(roleStats.byRole).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { id: 'assignments', label: 'Assignments', icon: Users },
            { id: 'versions', label: 'Versions', icon: Settings },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'history', label: 'History', icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={cn(
                'flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>
              <select
                value={filters.isActive?.toString() || ''}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    isActive: e.target.value === '' ? undefined : e.target.value === 'true',
                  }))
                }
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Status</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>
              <button
                onClick={() => setFilters({})}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Clear Filters
              </button>
            </div>

            {/* Assignments Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Version
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAssignments.map(assignment => (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <Users className="h-4 w-4 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {assignment.roleId}
                            </div>
                            {assignment.isDefault && (
                              <div className="text-xs text-blue-600 flex items-center">
                                <Star className="h-3 w-3 mr-1" />
                                Default
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{assignment.templateId}</div>
                        <div className="text-xs text-gray-500">
                          {assignment.metadata?.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          v{assignment.templateVersion}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            assignment.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {assignment.isActive ? (
                            <>
                              <Power className="h-3 w-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <PowerOff className="h-3 w-3 mr-1" />
                              Inactive
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {assignment.assignedAt.toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          {assignment.isActive ? (
                            <button
                              onClick={() => handleDeactivateAssignment(assignment.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Deactivate"
                            >
                              <PowerOff className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivateAssignment(assignment.id)}
                              className="text-green-600 hover:text-green-900"
                              title="Activate"
                            >
                              <Power className="h-4 w-4" />
                            </button>
                          )}

                          {!assignment.isDefault && (
                            <button
                              onClick={() => handleSetDefaultAssignment(assignment.id)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Set as Default"
                            >
                              <StarOff className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedAssignment(assignment)}
                            className="text-gray-600 hover:text-gray-900"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteAssignment(assignment)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredAssignments.length === 0 && (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No assignments found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating a new dashboard assignment.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowRolePanel(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Assignment
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <DashboardVersionManager
            templateId={selectedTemplate || 'director-template'}
            onVersionChange={version => {
              // UI-only state
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <DashboardAnalyticsDashboard
            templateId={selectedTemplate || undefined}
            roleId={selectedRole || undefined}
          />
        )}

        {activeTab === 'history' && (
          <AssignmentHistoryPanel
            history={assignmentHistory}
            templateId={selectedTemplate || undefined}
            roleId={selectedRole || undefined}
          />
        )}
      </div>

      {/* Role Assignment Panel Modal */}
      {showRolePanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <RoleAssignmentPanel
              roleId={selectedRole || 'Director'}
              onAssignmentUpdate={() => {
                queryClient.invalidateQueries({ queryKey: ['dashboard', 'assignments'] });
                setShowRolePanel(false);
              }}
            />
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => setShowRolePanel(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version Manager Modal */}
      {showVersionManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <DashboardVersionManager
              templateId={selectedTemplate || 'director-template'}
              onVersionChange={version => {
                // UI-only state
              }}
            />
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => setShowVersionManager(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardAssignmentManager;
