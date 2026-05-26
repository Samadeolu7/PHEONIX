// DashboardLayoutSwitcher - Simple layout switcher for basic UI preferences
import React, { useState } from 'react';
import { LayoutGrid, Workflow, Settings, Check } from 'lucide-react';
import { RoleBasedDashboard } from './RoleBasedDashboard';
import { WorkflowCentricDashboard } from './WorkflowCentricDashboard';

type DashboardLayout = 'role-based' | 'workflow-centric';

interface DashboardLayoutOption {
  id: DashboardLayout;
  title: string;
  description: string;
  icon: React.FC<any>;
  preview: string;
}

const dashboardOptions: DashboardLayoutOption[] = [
  {
    id: 'role-based',
    title: 'Role-Based Dashboard',
    description: 'Organized by business modules and user roles with quick access to key functions',
    icon: LayoutGrid,
    preview:
      'Module-focused layout with Financial Management, Client Services, Operations, and Administration cards',
  },
  {
    id: 'workflow-centric',
    title: 'Workflow-Centric Dashboard',
    description:
      'Process-oriented design showing sequential business workflows and task management',
    icon: Workflow,
    preview:
      'Process flow navigation with Financial Cycle, Client Services, and Operations Support workflows',
  },
];

interface DashboardLayoutSwitcherProps {
  defaultLayout?: DashboardLayout;
  onLayoutChange?: (layout: DashboardLayout) => void;
  showSwitcher?: boolean;
  className?: string;
}

export const DashboardLayoutSwitcher: React.FC<DashboardLayoutSwitcherProps> = ({
  defaultLayout = 'role-based',
  onLayoutChange,
  showSwitcher = true,
  className = '',
}) => {
  const [currentLayout, setCurrentLayout] = useState<DashboardLayout>(defaultLayout);
  const [showLayoutSelector, setShowLayoutSelector] = useState(false);

  const handleLayoutChange = (layout: DashboardLayout) => {
    setCurrentLayout(layout);
    setShowLayoutSelector(false);
    onLayoutChange?.(layout);
  };

  const currentOption = dashboardOptions.find(option => option.id === currentLayout);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Layout Switcher Header */}
      {showSwitcher && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                {currentOption && <currentOption.icon className="h-5 w-5" />}
                <span>{currentOption?.title}</span>
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {currentOption?.description}
              </p>
            </div>
            <button
              onClick={() => setShowLayoutSelector(!showLayoutSelector)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-150"
            >
              <Settings className="h-4 w-4" />
              <span>Switch Layout</span>
            </button>
          </div>

          {/* Layout Selector */}
          {showLayoutSelector && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Choose Dashboard Layout
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboardOptions.map(option => {
                  const Icon = option.icon;
                  const isSelected = option.id === currentLayout;

                  return (
                    <div
                      key={option.id}
                      className={`
                        relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
                        ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }
                      `}
                      onClick={() => handleLayoutChange(option.id)}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className="bg-blue-500 rounded-full p-1">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}

                      <div className="flex items-start space-x-3">
                        <div
                          className={`
                          p-2 rounded-lg 
                          ${isSelected ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-700'}
                        `}
                        >
                          <Icon
                            className={`
                            h-5 w-5 
                            ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}
                          `}
                          />
                        </div>
                        <div className="flex-1">
                          <h4
                            className={`
                            font-medium 
                            ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'}
                          `}
                          >
                            {option.title}
                          </h4>
                          <p
                            className={`
                            text-sm mt-1 
                            ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}
                          `}
                          >
                            {option.description}
                          </p>
                          <p
                            className={`
                            text-xs mt-2 
                            ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'}
                          `}
                          >
                            {option.preview}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dashboard Content */}
      <div>
        {currentLayout === 'role-based' ? <RoleBasedDashboard /> : <WorkflowCentricDashboard />}
      </div>
    </div>
  );
};
