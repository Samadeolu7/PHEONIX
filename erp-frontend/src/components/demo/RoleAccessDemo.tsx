// RoleAccessDemo component to demonstrate role-based access control
import React, { useState } from 'react';
import { Shield, Users, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accessControlService } from '../../services/accessControlService';

interface RoleAccessDemoProps {
  className?: string;
}

export const RoleAccessDemo: React.FC<RoleAccessDemoProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>('');

  const currentUserRoles = user?.roles || [];

  // Available roles for demonstration
  const availableRoles = [
    {
      id: 'finance-manager',
      name: 'Finance Manager',
      description: 'Full access to financial modules',
    },
    { id: 'finance-clerk', name: 'Finance Clerk', description: 'Basic financial operations' },
    { id: 'hr-manager', name: 'HR Manager', description: 'Full HR and payroll access' },
    { id: 'inventory-clerk', name: 'Inventory Clerk', description: 'Basic inventory operations' },
    {
      id: 'procurement-officer',
      name: 'Procurement Officer',
      description: 'Purchase orders and suppliers',
    },
    { id: 'academic-officer', name: 'Academic Officer', description: 'Student and fee management' },
    { id: 'branch-manager', name: 'Branch Manager', description: 'Multi-module branch oversight' },
    { id: 'admin', name: 'Administrator', description: 'Full system access' },
  ];

  // Search types for demonstration
  const searchTypes = [
    { type: 'invoice', label: 'Invoices' },
    { type: 'student', label: 'Students' },
    { type: 'supplier', label: 'Suppliers' },
    { type: 'item', label: 'Items' },
    { type: 'staff', label: 'Staff' },
    { type: 'receivable', label: 'Receivables' },
    { type: 'purchase-order', label: 'Purchase Orders' },
  ];

  // Sample pages for demonstration
  const samplePages = [
    { path: '/invoices', label: 'Invoices' },
    { path: '/receivables', label: 'Receivables' },
    { path: '/hr/staff', label: 'Staff Management' },
    { path: '/hr/payroll', label: 'Payroll' },
    { path: '/inventory', label: 'Inventory' },
    { path: '/procurement', label: 'Procurement' },
    { path: '/students', label: 'Students' },
    { path: '/entitlements', label: 'Entitlements' },
    { path: '/admin', label: 'Admin Panel' },
  ];

  const roleToTest = selectedRole || currentUserRoles[0] || 'finance-clerk';
  const testRoles = [roleToTest];

  const accessibleSearchTypes = accessControlService.getAccessibleSearchTypes(testRoles);
  const accessibleModules = accessControlService.getAccessibleModules(testRoles);

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center mb-6">
        <Shield className="h-5 w-5 text-purple-600 mr-2" />
        <h3 className="text-lg font-semibold text-gray-900">Role-Based Access Control Demo</h3>
      </div>

      {/* Current User Info */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center mb-2">
          <Users className="h-4 w-4 text-blue-600 mr-2" />
          <span className="font-medium text-blue-900">Current User</span>
        </div>
        <p className="text-sm text-blue-800">
          <strong>Email:</strong> {user?.email || 'Not logged in'}
        </p>
        <p className="text-sm text-blue-800">
          <strong>Roles:</strong>{' '}
          {currentUserRoles.length > 0 ? currentUserRoles.join(', ') : 'No roles assigned'}
        </p>
      </div>

      {/* Role Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Test Different Role Access:
        </label>
        <select
          value={selectedRole}
          onChange={e => setSelectedRole(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="">Use Current Role ({currentUserRoles[0] || 'None'})</option>
          {availableRoles.map(role => (
            <option key={role.id} value={role.id}>
              {role.name} - {role.description}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Access */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <Eye className="h-4 w-4 mr-2" />
            Search Access for: <span className="ml-1 text-purple-600">{roleToTest}</span>
          </h4>
          <div className="space-y-2">
            {searchTypes.map(({ type, label }) => {
              const hasAccess = accessibleSearchTypes.includes(type);
              return (
                <div key={type} className="flex items-center justify-between p-2 rounded border">
                  <span className="text-sm">{label}</span>
                  {hasAccess ? (
                    <div className="flex items-center text-green-600">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs">Allowed</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-600">
                      <XCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs">Denied</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Page Access */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <EyeOff className="h-4 w-4 mr-2" />
            Page Access for: <span className="ml-1 text-purple-600">{roleToTest}</span>
          </h4>
          <div className="space-y-2">
            {samplePages.map(({ path, label }) => {
              const hasAccess = accessControlService.canAccessPage(path, testRoles);
              return (
                <div key={path} className="flex items-center justify-between p-2 rounded border">
                  <span className="text-sm">{label}</span>
                  {hasAccess ? (
                    <div className="flex items-center text-green-600">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs">Allowed</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-600">
                      <XCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs">Denied</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Accessible Modules Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Accessible Modules Summary</h4>
        <div className="flex flex-wrap gap-2">
          {accessibleModules.includes('*') ? (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              All Modules (Admin Access)
            </span>
          ) : (
            accessibleModules.map(module => (
              <span
                key={module}
                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
              >
                {module}
              </span>
            ))
          )}
        </div>
        {accessibleModules.length === 0 && (
          <p className="text-sm text-gray-500">No accessible modules for this role.</p>
        )}
      </div>

      {/* Role Descriptions */}
      <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
        <h4 className="font-medium text-yellow-900 mb-2">💡 How Role-Based Access Works</h4>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>
            • <strong>Search Filtering:</strong> Only shows search results for modules you can
            access
          </li>
          <li>
            • <strong>Navigation Filtering:</strong> Hides pages and modules you don't have
            permission to view
          </li>
          <li>
            • <strong>Dynamic Access:</strong> Access changes instantly when roles are updated
          </li>
          <li>
            • <strong>Granular Control:</strong> Different roles have different levels of access
            within modules
          </li>
        </ul>
      </div>
    </div>
  );
};
