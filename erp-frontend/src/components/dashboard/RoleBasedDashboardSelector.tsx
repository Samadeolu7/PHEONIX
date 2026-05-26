// Role-based dashboard template selector component
import React, { useState } from 'react';
import { UserRole, AVAILABLE_ROLES } from '../../types/roles';
import { RoleBasedDashboardTemplate } from './RoleBasedDashboardTemplate';
import { dashboardTemplates } from '../../data/dashboardTemplates';
import {
  ChevronDown,
  Eye,
  Settings,
  Palette,
  BarChart3,
  Users,
  Shield,
  GraduationCap,
  FileText,
} from 'lucide-react';

interface RoleBasedDashboardSelectorProps {
  defaultRole?: UserRole;
  showRoleSelector?: boolean;
  className?: string;
}

const getRoleIcon = (role: UserRole) => {
  const icons = {
    Director: BarChart3,
    Principal: GraduationCap,
    Administrator: Settings,
    Registrar: Users,
    Officer: FileText,
  };
  return icons[role] || FileText;
};

const getRoleColor = (role: UserRole) => {
  const colors = {
    Director: 'bg-purple-500',
    Principal: 'bg-blue-500',
    Administrator: 'bg-gray-500',
    Registrar: 'bg-green-500',
    Officer: 'bg-yellow-500',
  };
  return colors[role] || 'bg-gray-500';
};

export const RoleBasedDashboardSelector: React.FC<RoleBasedDashboardSelectorProps> = ({
  defaultRole = 'Officer',
  showRoleSelector = true,
  className = '',
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(defaultRole);
  const [showDropdown, setShowDropdown] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const currentTemplate = dashboardTemplates[selectedRole];
  const RoleIcon = getRoleIcon(selectedRole);
  const roleColor = getRoleColor(selectedRole);

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setShowDropdown(false);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Role Selector Header */}
      {showRoleSelector && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <span>Role-Based Dashboard Templates</span>
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Preview dashboard templates for different user roles
              </p>
            </div>

            <div className="flex items-center space-x-3">
              {/* Preview Mode Toggle */}
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  previewMode
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Eye className="h-4 w-4" />
                <span>{previewMode ? 'Exit Preview' : 'Preview Mode'}</span>
              </button>

              {/* Role Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center space-x-3 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                >
                  <div className={`p-2 rounded-lg ${roleColor}`}>
                    <RoleIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{selectedRole}</p>
                    <p className="text-xs text-gray-500">{currentTemplate.description}</p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                      showDropdown ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-2">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide px-3 py-2">
                        Select Role Template
                      </div>
                      {AVAILABLE_ROLES.map(roleOption => {
                        const template = dashboardTemplates[roleOption.value];
                        const OptionIcon = getRoleIcon(roleOption.value);
                        const optionColor = getRoleColor(roleOption.value);
                        const isSelected = roleOption.value === selectedRole;

                        return (
                          <button
                            key={roleOption.value}
                            onClick={() => handleRoleChange(roleOption.value)}
                            className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-colors duration-200 ${
                              isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${optionColor}`}>
                              <OptionIcon className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p
                                  className={`text-sm font-medium ${
                                    isSelected ? 'text-blue-900' : 'text-gray-900'
                                  }`}
                                >
                                  {roleOption.label}
                                </p>
                                {isSelected && (
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                )}
                              </div>
                              <p
                                className={`text-xs mt-1 ${
                                  isSelected ? 'text-blue-700' : 'text-gray-500'
                                }`}
                              >
                                {roleOption.description}
                              </p>
                              <div className="flex items-center space-x-2 mt-2">
                                <span className="text-xs text-gray-400">
                                  {template.primaryModules.length} modules
                                </span>
                                <span className="text-xs text-gray-400">•</span>
                                <span className="text-xs text-gray-400">
                                  {template.statsCards.length} stats
                                </span>
                                <span className="text-xs text-gray-400">•</span>
                                <span className="text-xs text-gray-400">
                                  {template.quickActions.filter(a => a.isPrimary).length} quick
                                  actions
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Template Information */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Palette className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Theme</span>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <div
                  className="w-4 h-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: currentTemplate.theme.primaryColor }}
                ></div>
                <span className="text-xs text-gray-600">{currentTemplate.theme.primaryColor}</span>
              </div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <BarChart3 className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Stats Cards</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {currentTemplate.statsCards.length}
              </span>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Settings className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Quick Actions</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {currentTemplate.quickActions.length}
              </span>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Users className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Modules</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {currentTemplate.primaryModules.length + currentTemplate.secondaryModules.length}
              </span>
            </div>
          </div>

          {/* Template Features */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Template Features</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div
                className={`flex items-center space-x-2 ${
                  currentTemplate.showWelcomeBanner ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentTemplate.showWelcomeBanner ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                ></div>
                <span className="text-xs">Welcome Banner</span>
              </div>
              <div
                className={`flex items-center space-x-2 ${
                  currentTemplate.showQuickStats ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentTemplate.showQuickStats ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                ></div>
                <span className="text-xs">Quick Stats</span>
              </div>
              <div
                className={`flex items-center space-x-2 ${
                  currentTemplate.showModuleCards ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentTemplate.showModuleCards ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                ></div>
                <span className="text-xs">Module Cards</span>
              </div>
              <div
                className={`flex items-center space-x-2 ${
                  currentTemplate.showActivityFeed ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentTemplate.showActivityFeed ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                ></div>
                <span className="text-xs">Activity Feed</span>
              </div>
              <div
                className={`flex items-center space-x-2 ${
                  currentTemplate.showAlerts ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentTemplate.showAlerts ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                ></div>
                <span className="text-xs">System Alerts</span>
              </div>
            </div>
          </div>

          {previewMode && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Preview Mode Active</span>
              </div>
              <p className="text-xs text-yellow-700 mt-1">
                You are viewing the {selectedRole} dashboard template. This is a preview and does
                not affect your actual dashboard.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Dashboard Template */}
      <RoleBasedDashboardTemplate role={selectedRole} className="transition-all duration-300" />
    </div>
  );
};
