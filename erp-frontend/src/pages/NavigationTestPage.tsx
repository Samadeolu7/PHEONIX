// NavigationTestPage - Simple test page to demonstrate the navigation system
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, AVAILABLE_ROLES } from '../types/roles';

const NavigationTestPage: React.FC = () => {
  const { user, selectedRole, setRole } = useAuth();

  const handleRoleChange = (role: UserRole) => {
    setRole(role);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Navigation System Test</h1>

        <div className="space-y-6">
          {/* Current User Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Current User</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-500">Username:</span>
                <span className="ml-2 text-gray-900">{user?.username || 'Not logged in'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Email:</span>
                <span className="ml-2 text-gray-900">{user?.email || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Selected Role:</span>
                <span className="ml-2 text-gray-900">{selectedRole || 'None'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Tenant:</span>
                <span className="ml-2 text-gray-900">{user?.tenant_name || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Test Different Roles</h2>
            <p className="text-gray-600 mb-4">
              Select a role to see how the navigation bar changes color and shows different modules:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {AVAILABLE_ROLES.map(role => (
                <button
                  key={role.value}
                  onClick={() => handleRoleChange(role.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                    selectedRole === role.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-gray-900">{role.label}</div>
                  <div className="text-sm text-gray-500 mt-1">{role.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation Features */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Navigation Features</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <ul className="space-y-2 text-sm text-blue-800">
                <li>
                  • <strong>Role-based Colors:</strong> Each role has its own color scheme in the
                  navigation bar
                </li>
                <li>
                  • <strong>Module Access:</strong> Different roles see different modules based on
                  their permissions
                </li>
                <li>
                  • <strong>Responsive Design:</strong> On mobile, tap the menu button to see the
                  mobile navigation
                </li>
                <li>
                  • <strong>Active States:</strong> Current page is highlighted in the navigation
                </li>
                <li>
                  • <strong>Home Button:</strong> Always takes you back to the role-based dashboard
                </li>
                <li>
                  • <strong>User Menu:</strong> Access settings and logout from the top right
                </li>
              </ul>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Test Instructions</h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <ol className="space-y-2 text-sm text-yellow-800">
                <li>1. Select different roles above to see the navigation bar change colors</li>
                <li>
                  2. Click on module links in the navigation to navigate to different sections
                </li>
                <li>3. Try resizing your browser window to test mobile responsiveness</li>
                <li>4. Click the "Home" button to return to the dashboard</li>
                <li>5. Check that the current page is highlighted in the navigation</li>
              </ol>
            </div>
          </div>

          {/* Current Role Info */}
          {selectedRole && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Current Role: {selectedRole}
              </h2>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  The navigation bar should now be styled with the {selectedRole} role colors. Check
                  the modules available in the navigation - they should match what this role has
                  access to.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavigationTestPage;
