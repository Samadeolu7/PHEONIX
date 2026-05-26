// Dashboard Assignment Page - Admin page for managing dashboard assignments
import React, { useState, useEffect } from 'react';
import { Settings, Users, BarChart3, Shield, ArrowLeft, Info, Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardAssignmentManager } from '../../components/dashboard/DashboardAssignmentManager';
import { DashboardAssignment } from '../../types/dashboardAssignment';
import { api } from '../../services/api';
import { userManagementService, Role } from '../../services/userManagementService';

interface Dashboard {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
}

interface RoleDashboardState {
  roles: Role[];
  dashboards: Dashboard[];
  loading: boolean;
  saving: Record<number, boolean>;
  error: string | null;
  success: Record<number, boolean>;
}

const RoleDashboardAssignment: React.FC = () => {
  const [state, setState] = useState<RoleDashboardState>({
    roles: [],
    dashboards: [],
    loading: true,
    saving: {},
    error: null,
    success: {},
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [roles, dashboardsRes] = await Promise.all([
          userManagementService.getRoles(),
          api.get('/dashboards/'),
        ]);
        setState(prev => ({
          ...prev,
          roles,
          dashboards: Array.isArray(dashboardsRes) ? dashboardsRes : dashboardsRes?.results ?? [],
          loading: false,
        }));
      } catch (e) {
        setState(prev => ({ ...prev, loading: false, error: 'Failed to load data.' }));
      }
    };
    load();
  }, []);

  const handleChange = async (roleId: number, dashboardId: number | null) => {
    setState(prev => ({ ...prev, saving: { ...prev.saving, [roleId]: true }, success: { ...prev.success, [roleId]: false } }));
    try {
      await api.patch(`/users/roles/${roleId}/`, { default_dashboard: dashboardId });
      setState(prev => ({
        ...prev,
        roles: prev.roles.map(r => r.id === roleId ? { ...r, default_dashboard: dashboardId } : r),
        saving: { ...prev.saving, [roleId]: false },
        success: { ...prev.success, [roleId]: true },
      }));
      setTimeout(() => setState(prev => ({ ...prev, success: { ...prev.success, [roleId]: false } })), 2000);
    } catch {
      setState(prev => ({ ...prev, saving: { ...prev.saving, [roleId]: false }, error: `Failed to update role ${roleId}.` }));
    }
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-600">Loading roles and dashboards…</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4 bg-red-50 rounded-lg">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <span>{state.error}</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium text-gray-700">Role</th>
            <th className="text-left py-3 px-4 font-medium text-gray-700">Users</th>
            <th className="text-left py-3 px-4 font-medium text-gray-700">Default Dashboard</th>
            <th className="py-3 px-4" />
          </tr>
        </thead>
        <tbody>
          {state.roles.map(role => (
            <tr key={role.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-4">
                <div className="font-medium text-gray-900">{role.name}</div>
                {role.description && <div className="text-xs text-gray-500 mt-0.5">{role.description}</div>}
              </td>
              <td className="py-3 px-4 text-gray-600">{role.user_count ?? 0}</td>
              <td className="py-3 px-4">
                <select
                  aria-label={`Default dashboard for ${role.name}`}
                  value={role.default_dashboard ?? ''}
                  onChange={e => handleChange(role.id, e.target.value ? Number(e.target.value) : null)}
                  disabled={state.saving[role.id]}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-w-[200px]"
                >
                  <option value="">— No default —</option>
                  {state.dashboards.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </td>
              <td className="py-3 px-4 w-8">
                {state.saving[role.id] && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {state.success[role.id] && <Check className="h-4 w-4 text-green-500" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.roles.length === 0 && (
        <p className="text-center text-gray-500 py-8">No roles found.</p>
      )}
    </div>
  );
};

export const DashboardAssignmentPage: React.FC = () => {
  const [selectedAssignment, setSelectedAssignment] = useState<DashboardAssignment | null>(null);
  const [activeTab, setActiveTab] = useState<'role-defaults' | 'assignment-manager'>('role-defaults');

  const handleAssignmentChange = (assignment: DashboardAssignment) => {
    setSelectedAssignment(assignment);
    console.log('Assignment changed:', assignment);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.history.back()}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back</span>
              </button>

              <div className="h-6 w-px bg-gray-300" />

              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                  <Settings className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Dashboard Management</h1>
                  <p className="text-sm text-gray-600">
                    Manage dashboard assignments and analytics
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Shield className="h-4 w-4" />
                <span>Admin Access Required</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('role-defaults')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'role-defaults'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Role Dashboard Defaults
            </div>
          </button>
          <button
            onClick={() => setActiveTab('assignment-manager')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'assignment-manager'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Assignment Manager
            </div>
          </button>
        </div>

        {activeTab === 'role-defaults' && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="ml-3 text-sm text-blue-700">
                  Set a <strong>default dashboard</strong> for each role. When a user logs in, they
                  are redirected to their individually assigned dashboard first, then to their
                  role&apos;s default if no individual assignment exists.
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">Role → Default Dashboard</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Changes are saved immediately when you select a dashboard.
                </p>
              </div>
              <div className="p-4">
                <RoleDashboardAssignment />
              </div>
            </div>
          </>
        )}

        {activeTab === 'assignment-manager' && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                <div className="ml-3 text-sm text-blue-700">
                  Manage dashboard versions, analytics, and assignment history.
                </div>
              </div>
            </div>

            <DashboardAssignmentManager
              onAssignmentChange={handleAssignmentChange}
              className="shadow-sm"
            />

            {selectedAssignment && (
              <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Assignment Change</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Role:</span>
                    <p className="text-sm text-gray-900 mt-1">{selectedAssignment.roleId}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">Template:</span>
                    <p className="text-sm text-gray-900 mt-1">{selectedAssignment.templateId}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">Status:</span>
                    <p
                      className={cn(
                        'text-sm mt-1',
                        selectedAssignment.isActive ? 'text-green-600' : 'text-gray-600'
                      )}
                    >
                      {selectedAssignment.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardAssignmentPage;
