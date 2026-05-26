// Test page to demonstrate role-based permission system
import React, { lazy, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  PermissionGate,
  RoleGate,
  PageGate,
  CategoryGate,
  AdminGate,
  DirectorGate,
  FinancialGate,
  AcademicGate,
} from '../components/auth/PermissionGate';
const PermissionAwareNavigation = lazy(
  () => import('../components/navigation/PermissionAwareNavigation')
);
import { FUNCTIONAL_CATEGORIES } from '../types/permissions';
import { AVAILABLE_ROLES } from '../types/roles';

export const PermissionTestPage: React.FC = () => {
  const { selectedRole, userWithRole } = useAuth();
  const { permissions, getAccessiblePages, getAccessibleCategories, hasAccess, canAccessCategory } =
    usePermissions();

  const accessiblePages = getAccessiblePages();
  const accessibleCategories = getAccessibleCategories();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Role-Based Permission System Test</h1>
            <p className="mt-1 text-sm text-gray-600">
              Testing the Phoenix Software Access Table implementation
            </p>
          </div>

          <div className="p-6 space-y-8">
            {/* Current User Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">Current User Context</h2>
              {userWithRole ? (
                <div className="space-y-1 text-sm text-blue-800">
                  <p>
                    <span className="font-medium">Name:</span> {userWithRole.first_name}{' '}
                    {userWithRole.last_name}
                  </p>
                  <p>
                    <span className="font-medium">Email:</span> {userWithRole.email}
                  </p>
                  <p>
                    <span className="font-medium">Selected Role:</span> {selectedRole || 'None'}
                  </p>
                  <p>
                    <span className="font-medium">Total Permissions:</span> {permissions.length}
                  </p>
                </div>
              ) : (
                <p className="text-blue-800">No user logged in or role selected</p>
              )}
            </div>

            {/* Permission Gates Demo */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Permission Gates Demo</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Director Only */}
                <DirectorGate>
                  <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
                    <h3 className="font-medium text-purple-900">Director Only Content</h3>
                    <p className="text-sm text-purple-700">This is only visible to Directors</p>
                  </div>
                </DirectorGate>

                {/* Admin Only */}
                <AdminGate>
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <h3 className="font-medium text-red-900">Admin Only Content</h3>
                    <p className="text-sm text-red-700">
                      This is visible to Directors and Administrators
                    </p>
                  </div>
                </AdminGate>

                {/* Financial Access */}
                <FinancialGate>
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <h3 className="font-medium text-green-900">Financial Access Content</h3>
                    <p className="text-sm text-green-700">
                      This is visible to Directors, Principals, and Officers
                    </p>
                  </div>
                </FinancialGate>

                {/* Academic Access */}
                <AcademicGate>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <h3 className="font-medium text-yellow-900">Academic Access Content</h3>
                    <p className="text-sm text-yellow-700">
                      This is visible to Directors, Principals, and Registrars
                    </p>
                  </div>
                </AcademicGate>

                {/* Specific Page Access */}
                <PageGate pageId="financial.invoice_generation">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-md p-4">
                    <h3 className="font-medium text-indigo-900">Invoice Generation Access</h3>
                    <p className="text-sm text-indigo-700">
                      This is visible to users who can generate invoices
                    </p>
                  </div>
                </PageGate>

                {/* Category Access */}
                <CategoryGate category="Reports & Analytics">
                  <div className="bg-pink-50 border border-pink-200 rounded-md p-4">
                    <h3 className="font-medium text-pink-900">Reports & Analytics Access</h3>
                    <p className="text-sm text-pink-700">
                      This is visible to users who can access reports
                    </p>
                  </div>
                </CategoryGate>
              </div>
            </div>

            {/* Accessible Categories */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Accessible Categories</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {FUNCTIONAL_CATEGORIES.map(category => (
                  <div
                    key={category}
                    className={`p-3 rounded-md border ${
                      canAccessCategory(category)
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <div className="flex items-center">
                      <div
                        className={`w-3 h-3 rounded-full mr-2 ${
                          canAccessCategory(category) ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      <span className="text-sm font-medium">{category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Accessible Pages Summary */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Accessible Pages ({accessiblePages.length} total)
              </h2>
              <div className="bg-gray-50 rounded-md p-4 max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {accessiblePages.map(page => (
                    <div key={page.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{page.title}</span>
                      <span className="text-gray-500">{page.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Role Comparison */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Role Comparison</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Categories
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pages
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {AVAILABLE_ROLES.map(role => {
                      const isCurrent = selectedRole === role.value;
                      return (
                        <tr key={role.value} className={isCurrent ? 'bg-blue-50' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="text-sm font-medium text-gray-900">{role.label}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isCurrent && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Current
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {/* This would show accessible categories for each role */}
                            {isCurrent ? accessibleCategories.length : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {isCurrent ? accessiblePages.length : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Permission-Aware Navigation Demo */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Permission-Aware Navigation
              </h2>
              <div className="bg-gray-50 rounded-md p-4">
                <Suspense
                  fallback={<div className="p-4 text-sm text-gray-500">Loading navigation...</div>}
                >
                  <PermissionAwareNavigation className="max-h-96 overflow-y-auto" />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
