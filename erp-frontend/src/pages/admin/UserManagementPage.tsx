// src/pages/admin/UserManagementPage.tsx
import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  BarChart3,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  userManagementService,
  User,
  Role,
  Dashboard,
  UserStatistics,
} from '../../services/userManagementService';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';

import { getRoleRank } from '../../types/roles';

// Rank thresholds for user management actions
const PRIVILEGED_MIN_RANK = 3;   // Administrator+ can see/edit role assignments
const USER_CREATION_MIN_RANK = 4; // Principal+ can create new users

const UserManagementPage: React.FC = () => {
  const toast = useToast();
  const { hasPermission } = usePermission();
  const { user: currentUser } = useAuth();

  // Determine if the logged-in user has a privileged role (can manage role assignments)
  const currentUserRoles: string[] = (currentUser as any)?.roles || [];
  const maxRank = Math.max(0, ...currentUserRoles.map(getRoleRank));
  const isPrivilegedUser = maxRank >= PRIVILEGED_MIN_RANK;
  const isDirectorOrPrincipal = maxRank >= USER_CREATION_MIN_RANK;
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'statistics' | 'permissions'>(
    'users'
  );
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [statistics, setStatistics] = useState<UserStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // User form state
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    confirm_password: '',
    roles: [] as number[],
    assigned_dashboard: null as number | null,
    is_active_user: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  // User whose details are being viewed (read-only modal with delete action)
  const [viewingUser, setViewingUser] = useState<User | null>(null);

  // Role form state
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    default_dashboard: null as number | null,
    can_access_dashboards: [] as number[],
    can_access_modules: [] as string[],
    can_access_pages: [] as string[],
    is_active: true,
  });

  // ==========================================================================
  // Permission Checks
  // ==========================================================================

  const canViewUsers = hasPermission('user-list');
  const canCreateUser = hasPermission('user-create');
  const canEditUser = hasPermission('user-edit');
  const canDeleteUser = hasPermission('user-delete');
  const canToggleUserStatus = hasPermission('user-toggle-status');

  const canViewRoles = hasPermission('role-list');
  const canCreateRole = hasPermission('role-create');
  const canEditRole = hasPermission('role-edit');
  const canDeleteRole = hasPermission('role-delete');

  const canViewPermissions = hasPermission('permission-view');
  const canManagePermissions = hasPermission('permission-manage');

  const canViewStatistics = hasPermission('user-statistics-view');

  // Determine which tabs to show based on permissions
  const availableTabs = [];
  if (canViewUsers) availableTabs.push('users');
  if (canViewRoles) availableTabs.push('roles');
  if (canViewPermissions || canManagePermissions) availableTabs.push('permissions');
  if (canViewStatistics) availableTabs.push('statistics');

  // Set default tab based on available permissions
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] as any);
    }
  }, [availableTabs]);

  // ==========================================================================
  // Data Loading
  // ==========================================================================

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const promises = [];

      if (canViewUsers) {
        promises.push(userManagementService.getUsers());
      } else {
        promises.push(Promise.resolve([]));
      }

      if (canViewRoles) {
        promises.push(userManagementService.getRoles());
      } else {
        promises.push(Promise.resolve([]));
      }

      promises.push(userManagementService.getAvailableDashboards());

      const [usersResponse, rolesResponse, dashboardsResponse] = await Promise.all(promises);

      const usersData = Array.isArray(usersResponse)
        ? usersResponse
        : usersResponse?.results || usersResponse?.data || [];

      const rolesData = Array.isArray(rolesResponse)
        ? rolesResponse
        : rolesResponse?.results || rolesResponse?.data || [];

      const dashboardsData = Array.isArray(dashboardsResponse)
        ? dashboardsResponse
        : dashboardsResponse?.results || dashboardsResponse?.data || [];

      setUsers(usersData);
      setRoles(rolesData);
      setDashboards(dashboardsData);

      if (activeTab === 'statistics' && canViewStatistics) {
        const stats = await userManagementService.getUserStatistics();
        setStatistics(stats);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // User Management Functions
  // ==========================================================================

  const handleCreateUser = () => {
    if (!canCreateUser || !isDirectorOrPrincipal) return;
    setEditingUser(null);
    setUserForm({
      username: '',
      email: '',
      first_name: '',
      last_name: '',
      password: '',
      confirm_password: '',
      roles: [],
      assigned_dashboard: null,
      is_active_user: true,
    });
    setShowPassword(false);
    setShowUserModal(true);
  };

  const handleEditUser = (user: User) => {
    if (!canEditUser || !isDirectorOrPrincipal) return;
    setEditingUser(user);
    setUserForm({
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      password: '',
      confirm_password: '',
      roles: user.roles,
      assigned_dashboard: user.assigned_dashboard,
      is_active_user: user.is_active_user,
    });
    setShowPassword(false);
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Non-privileged users may not update roles or active-status of other users
        const payload = isPrivilegedUser
          ? userForm
          : {
              first_name: userForm.first_name,
              last_name: userForm.last_name,
              email: userForm.email,
            };
        await userManagementService.updateUser(editingUser.id, payload);
        toast.success('User updated successfully');
      } else {
        // Validate password on create
        if (!userForm.password) {
          toast.error('Password is required');
          return;
        }
        if (userForm.password !== userForm.confirm_password) {
          toast.error('Passwords do not match');
          return;
        }
        if (userForm.password.length < 8) {
          toast.error('Password must be at least 8 characters');
          return;
        }
        // Strip confirm_password before sending to API
        const { confirm_password, ...createPayload } = userForm;
        await userManagementService.createUser(createPayload);
        toast.success('User created successfully');
      }
      setShowUserModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save user');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!canDeleteUser) return;
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await userManagementService.deleteUser(userId);
      toast.success('User deleted successfully');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user');
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    if (!canToggleUserStatus) return;
    try {
      if (user.is_active_user) {
        await userManagementService.deactivateUser(user.id);
        toast.success('User deactivated');
      } else {
        await userManagementService.activateUser(user.id);
        toast.success('User activated');
      }
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status');
    }
  };

  // ==========================================================================
  // Role Management Functions
  // ==========================================================================

  const handleCreateRole = () => {
    if (!canCreateRole) return;
    setEditingRole(null);
    setRoleForm({
      name: '',
      description: '',
      default_dashboard: null,
      can_access_dashboards: [],
      can_access_modules: [],
      can_access_pages: [],
      is_active: true,
    });
    setShowRoleModal(true);
  };

  const handleEditRole = (role: Role) => {
    if (!canEditRole) return;
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description,
      default_dashboard: role.default_dashboard,
      can_access_dashboards: role.can_access_dashboards,
      can_access_modules: role.can_access_modules,
      can_access_pages: role.can_access_pages,
      is_active: role.is_active,
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    try {
      if (editingRole) {
        await userManagementService.updateRole(editingRole.id, roleForm);
        toast.success('Role updated successfully');
      } else {
        await userManagementService.createRole(roleForm);
        toast.success('Role created successfully');
      }
      setShowRoleModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save role');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!canDeleteRole) return;
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      await userManagementService.deleteRole(roleId);
      toast.success('Role deleted successfully');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
    }
  };

  // ==========================================================================
  // Access Denied
  // ==========================================================================

  if (!canViewUsers && !canViewRoles && !canViewPermissions && !canViewStatistics) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h2
            style={{ fontSize: '1.5rem', fontWeight: 600, color: '#991b1b', marginBottom: '1rem' }}
          >
            Access Denied
          </h2>
          <p style={{ color: '#b91c1c' }}>
            You don't have permission to access the User Management page.
          </p>
        </div>
      </div>
    );
  }

  if (loading && activeTab !== 'permissions') {
    return <div style={{ padding: '2rem' }}>Loading user management...</div>;
  }

  if (error && activeTab !== 'permissions') {
    return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Users style={{ width: '2rem', height: '2rem' }} />
          User Management
        </h1>
        <p style={{ color: '#6b7280' }}>
          Manage users, roles, permissions, and dashboard assignments
        </p>
      </div>

      {/* Tabs - Only show tabs user has permission for */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {canViewUsers && (
            <button
              onClick={() => setActiveTab('users')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'users' ? '2px solid #3b82f6' : 'none',
                color: activeTab === 'users' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'users' ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Users style={{ width: '1.25rem', height: '1.25rem' }} />
              Users
            </button>
          )}

          {canViewRoles && (
            <button
              onClick={() => setActiveTab('roles')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'roles' ? '2px solid #3b82f6' : 'none',
                color: activeTab === 'roles' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'roles' ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Shield style={{ width: '1.25rem', height: '1.25rem' }} />
              Roles
            </button>
          )}

          {(canViewPermissions || canManagePermissions) && (
            <button
              onClick={() => setActiveTab('permissions')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'permissions' ? '2px solid #3b82f6' : 'none',
                color: activeTab === 'permissions' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'permissions' ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Key style={{ width: '1.25rem', height: '1.25rem' }} />
              Permissions
            </button>
          )}

          {canViewStatistics && (
            <button
              onClick={() => setActiveTab('statistics')}
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'statistics' ? '2px solid #3b82f6' : 'none',
                color: activeTab === 'statistics' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'statistics' ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <BarChart3 style={{ width: '1.25rem', height: '1.25rem' }} />
              Statistics
            </button>
          )}
        </div>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && canViewUsers && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Users ({users.length})</h2>
            {canCreateUser && isDirectorOrPrincipal && (
              <button
                onClick={handleCreateUser}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                }}
              >
                <UserPlus style={{ width: '1rem', height: '1rem' }} />
                Add User
              </button>
            )}
          </div>

          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    User
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    Email
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    Roles
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    Dashboard
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 500 }}>{user.full_name}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>@{user.username}</div>
                      {user.is_owner && (
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 500 }}>
                          (Owner)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{user.email}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {user.role_names.map((role, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '0.125rem 0.5rem',
                              background: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                            }}
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {user.assigned_dashboard_name || 'Default'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {user.is_active_user ? (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            color: '#16a34a',
                            fontSize: '0.875rem',
                          }}
                        >
                          <CheckCircle style={{ width: '1rem', height: '1rem' }} />
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            color: '#dc2626',
                            fontSize: '0.875rem',
                          }}
                        >
                          <XCircle style={{ width: '1rem', height: '1rem' }} />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={() => setViewingUser(user)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            color: '#16a34a',
                          }}
                          title="View details"
                        >
                          <Eye style={{ width: '1rem', height: '1rem' }} />
                        </button>
                        {canEditUser && isDirectorOrPrincipal && (
                          <button
                            onClick={() => handleEditUser(user)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                              color: '#1e40af',
                            }}
                            title="Edit user"
                          >
                            <Edit style={{ width: '1rem', height: '1rem' }} />
                          </button>
                        )}
                        {canToggleUserStatus && (
                          <button
                            onClick={() => handleToggleUserStatus(user)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: user.is_active_user ? '#fef2f2' : '#f0fdf4',
                              border: user.is_active_user
                                ? '1px solid #fecaca'
                                : '1px solid #bbf7d0',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                              color: user.is_active_user ? '#dc2626' : '#16a34a',
                            }}
                            title={user.is_active_user ? 'Deactivate' : 'Activate'}
                          >
                            {user.is_active_user ? (
                              <XCircle style={{ width: '1rem', height: '1rem' }} />
                            ) : (
                              <CheckCircle style={{ width: '1rem', height: '1rem' }} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && canViewRoles && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Roles ({roles.length})</h2>
            {canCreateRole && (
              <button
                onClick={handleCreateRole}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                }}
              >
                <Shield style={{ width: '1rem', height: '1rem' }} />
                Add Role
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
            }}
          >
            {roles.map(role => (
              <div
                key={role.id}
                style={{
                  background: 'white',
                  padding: '1.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      {role.name}
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {role.description || 'No description'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {canEditRole && (
                      <button
                        onClick={() => handleEditRole(role)}
                        style={{
                          padding: '0.25rem',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#3b82f6',
                        }}
                        title="Edit role"
                      >
                        <Edit style={{ width: '1.25rem', height: '1.25rem' }} />
                      </button>
                    )}
                    {canDeleteRole && isDirectorOrPrincipal && (
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        style={{
                          padding: '0.25rem',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#dc2626',
                        }}
                        title="Delete role"
                      >
                        <Trash2 style={{ width: '1.25rem', height: '1.25rem' }} />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Users:</span>
                    <span style={{ fontWeight: 500 }}>{role.user_count}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Default Dashboard:</span>
                    <span style={{ fontWeight: 500 }}>
                      {dashboards.find(d => d.id === role.default_dashboard)?.name || 'None'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Status:</span>
                    <span
                      style={{ fontWeight: 500, color: role.is_active ? '#16a34a' : '#dc2626' }}
                    >
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permissions Tab — now lives at /admin/permission-setup */}
      {activeTab === 'permissions' && (canViewPermissions || canManagePermissions) && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center',
        }}>
          <div style={{
            width: '3.5rem', height: '3.5rem', borderRadius: '1rem',
            background: 'rgba(99,102,241,0.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem',
          }}>
            <Shield style={{ width: '1.75rem', height: '1.75rem', color: '#6366f1' }} />
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', color: '#111827' }}>
            Permission Management has moved
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', maxWidth: '28rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Page Policies and Action Permissions are now managed together on the
            <strong> Permission Setup</strong> page — one place to configure everything for each role.
          </p>
          <Link
            to="/admin/permission-setup"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1.5rem', background: '#6366f1', color: 'white',
              borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            <ExternalLink style={{ width: '1rem', height: '1rem' }} />
            Go to Permission Setup
          </Link>
        </div>
      )}

      {/* User Details Modal — delete lives here, not in the list */}
      {viewingUser && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setViewingUser(null)}
        >
          <div
            style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '0.5rem',
              maxWidth: '480px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  {viewingUser.full_name}
                </h2>
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>@{viewingUser.username}</p>
              </div>
              {viewingUser.is_owner && (
                <span
                  style={{
                    padding: '0.25rem 0.75rem',
                    background: '#fef3c7',
                    color: '#92400e',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  Owner
                </span>
              )}
            </div>

            {/* Details */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.875rem',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #f3f4f6',
                  paddingBottom: '0.75rem',
                }}
              >
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Email</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{viewingUser.email}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #f3f4f6',
                  paddingBottom: '0.75rem',
                }}
              >
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Status</span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: viewingUser.is_active_user ? '#16a34a' : '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  {viewingUser.is_active_user ? (
                    <>
                      <CheckCircle style={{ width: '0.875rem', height: '0.875rem' }} /> Active
                    </>
                  ) : (
                    <>
                      <XCircle style={{ width: '0.875rem', height: '0.875rem' }} /> Inactive
                    </>
                  )}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #f3f4f6',
                  paddingBottom: '0.75rem',
                }}
              >
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Dashboard</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {viewingUser.assigned_dashboard_name || 'Default'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Roles</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {viewingUser.role_names.length > 0 ? (
                    viewingUser.role_names.map((role, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '0.25rem 0.75rem',
                          background: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: '9999px',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                        }}
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                      No roles assigned
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                borderTop: '1px solid #e5e7eb',
                paddingTop: '1rem',
              }}
            >
              <button
                onClick={() => setViewingUser(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Close
              </button>
              {canEditUser && isDirectorOrPrincipal && (
                <button
                  onClick={() => {
                    setViewingUser(null);
                    handleEditUser(viewingUser);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#1e40af',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                  }}
                >
                  <Edit style={{ width: '1rem', height: '1rem' }} /> Edit
                </button>
              )}
              {!viewingUser.is_owner && canDeleteUser && isDirectorOrPrincipal && (
                <button
                  onClick={() => {
                    setViewingUser(null);
                    handleDeleteUser(viewingUser.id);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#dc2626',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                  }}
                >
                  <Trash2 style={{ width: '1rem', height: '1rem' }} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUserModal(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '0.5rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
              {editingUser ? 'Edit User' : 'Create User'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Username
                </label>
                <input
                  type="text"
                  value={userForm.username}
                  onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                  disabled={!!editingUser}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      marginBottom: '0.25rem',
                    }}
                  >
                    First Name
                  </label>
                  <input
                    type="text"
                    value={userForm.first_name}
                    onChange={e => setUserForm({ ...userForm, first_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={userForm.last_name}
                    onChange={e => setUserForm({ ...userForm, last_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                    }}
                  />
                </div>
              </div>

              {/* Password fields — only shown when creating a new user */}
              {!editingUser && (
                <>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.25rem',
                      }}
                    >
                      Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={userForm.password}
                        onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          paddingRight: '2.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          boxSizing: 'border-box',
                        }}
                        placeholder="Min 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          padding: 0,
                        }}
                      >
                        {showPassword ? (
                          <EyeOff style={{ width: '1rem', height: '1rem' }} />
                        ) : (
                          <Eye style={{ width: '1rem', height: '1rem' }} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.25rem',
                      }}
                    >
                      Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={userForm.confirm_password}
                      onChange={e => setUserForm({ ...userForm, confirm_password: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: `1px solid ${userForm.confirm_password && userForm.password !== userForm.confirm_password ? '#ef4444' : '#d1d5db'}`,
                        borderRadius: '0.375rem',
                        boxSizing: 'border-box',
                      }}
                      placeholder="Re-enter password"
                    />
                    {userForm.confirm_password &&
                      userForm.password !== userForm.confirm_password && (
                        <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                          Passwords do not match
                        </span>
                      )}
                  </div>
                </>
              )}

              {isDirectorOrPrincipal && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      marginBottom: '0.5rem',
                    }}
                  >
                    Roles
                  </label>
                  <div
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      padding: '0.5rem',
                      maxHeight: '180px',
                      overflowY: 'auto',
                    }}
                  >
                    {roles.map(role => (
                      <label
                        key={role.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.25rem',
                          cursor: 'pointer',
                          borderRadius: '0.25rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={userForm.roles.includes(role.id)}
                          onChange={e => {
                            const roleId = role.id;
                            setUserForm({
                              ...userForm,
                              roles: e.target.checked
                                ? [...userForm.roles, roleId]
                                : userForm.roles.filter(r => r !== roleId),
                            });
                          }}
                        />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{role.name}</span>
                        {role.description && (
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            — {role.description}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  {userForm.roles.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                      No role selected — user will have no permissions
                    </p>
                  )}
                </div>
              )}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Assigned Dashboard
                </label>
                <select
                  value={userForm.assigned_dashboard || ''}
                  onChange={e =>
                    setUserForm({
                      ...userForm,
                      assigned_dashboard: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                >
                  <option value="">Default (from role)</option>
                  {dashboards.map(dashboard => (
                    <option key={dashboard.id} value={dashboard.id}>
                      {dashboard.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={userForm.is_active_user}
                  onChange={e => setUserForm({ ...userForm, is_active_user: e.target.checked })}
                  id="is_active"
                />
                <label htmlFor="is_active" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  Active User
                </label>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '1.5rem',
              }}
            >
              <button
                onClick={() => setShowUserModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUser}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowRoleModal(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '0.5rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
              {editingRole ? 'Edit Role' : 'Create Role'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Role Name
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Description
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    minHeight: '80px',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    marginBottom: '0.25rem',
                  }}
                >
                  Default Dashboard
                </label>
                <select
                  value={roleForm.default_dashboard || ''}
                  onChange={e =>
                    setRoleForm({
                      ...roleForm,
                      default_dashboard: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                >
                  <option value="">None</option>
                  {dashboards.map(dashboard => (
                    <option key={dashboard.id} value={dashboard.id}>
                      {dashboard.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={roleForm.is_active}
                  onChange={e => setRoleForm({ ...roleForm, is_active: e.target.checked })}
                  id="role_is_active"
                />
                <label htmlFor="role_is_active" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  Active Role
                </label>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '1.5rem',
              }}
            >
              <button
                onClick={() => setShowRoleModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;
