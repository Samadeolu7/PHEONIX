// RoleBasedNavigation component that filters navigation items based on user roles
import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accessControlService } from '../../services/accessControlService';

interface NavigationItem {
  id: string;
  title: string;
  path: string;
  icon: LucideIcon;
  description?: string;
  permissions?: string[];
  isNew?: boolean;
  isEnhanced?: boolean;
}

interface NavigationModule {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  children: NavigationItem[];
  permissions?: string[];
  color?: string;
}

interface RoleBasedNavigationProps {
  modules: NavigationModule[];
  className?: string;
  layout?: 'grid' | 'list';
  showDescriptions?: boolean;
}

export const RoleBasedNavigation: React.FC<RoleBasedNavigationProps> = ({
  modules,
  className = '',
  layout = 'grid',
  showDescriptions = true,
}) => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  // Filter modules and items based on user roles
  const accessibleModules = modules
    .map(module => ({
      ...module,
      children: accessControlService.filterNavigationItems(module.children, userRoles),
    }))
    .filter(module => {
      // Show module if user has access to at least one child item
      if (module.children.length === 0) return false;

      // Check module-level permissions if defined
      if (module.permissions && module.permissions.length > 0) {
        return module.permissions.some(permission => userRoles.includes(permission));
      }

      return true;
    });

  if (accessibleModules.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No accessible modules found for your role.</p>
        <p className="text-sm text-gray-400 mt-2">
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className={`role-based-navigation ${className}`}>
      {layout === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accessibleModules.map(module => (
            <ModuleCard key={module.id} module={module} showDescriptions={showDescriptions} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {accessibleModules.map(module => (
            <ModuleList key={module.id} module={module} showDescriptions={showDescriptions} />
          ))}
        </div>
      )}
    </div>
  );
};

// Module card component for grid layout
const ModuleCard: React.FC<{
  module: NavigationModule;
  showDescriptions: boolean;
}> = ({ module, showDescriptions }) => {
  const Icon = module.icon;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-center mb-4">
          <div className={`p-2 rounded-lg bg-${module.color || 'blue'}-100`}>
            <Icon className={`h-6 w-6 text-${module.color || 'blue'}-600`} />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
            {showDescriptions && <p className="text-sm text-gray-500">{module.description}</p>}
          </div>
        </div>

        <div className="space-y-2">
          {module.children.slice(0, 5).map(item => (
            <Link
              key={item.id}
              to={item.path}
              className="flex items-center p-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
            >
              {item.icon && <item.icon className="h-4 w-4 mr-2 text-gray-400" />}
              <span className="flex-1">{item.title}</span>
              {item.isNew && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                  New
                </span>
              )}
              {item.isEnhanced && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                  Enhanced
                </span>
              )}
            </Link>
          ))}

          {module.children.length > 5 && (
            <div className="text-xs text-gray-500 text-center pt-2">
              +{module.children.length - 5} more items
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Module list component for list layout
const ModuleList: React.FC<{
  module: NavigationModule;
  showDescriptions: boolean;
}> = ({ module, showDescriptions }) => {
  const Icon = module.icon;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center">
          <div className={`p-2 rounded-lg bg-${module.color || 'blue'}-100`}>
            <Icon className={`h-5 w-5 text-${module.color || 'blue'}-600`} />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
            {showDescriptions && <p className="text-sm text-gray-500">{module.description}</p>}
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {module.children.map(item => (
            <Link
              key={item.id}
              to={item.path}
              className="flex items-center p-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
            >
              {item.icon && <item.icon className="h-4 w-4 mr-2 text-gray-400" />}
              <span className="flex-1">{item.title}</span>
              {item.isNew && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                  New
                </span>
              )}
              {item.isEnhanced && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                  Enhanced
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

// Hook for getting accessible navigation items
export const useAccessibleNavigation = () => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const filterNavigationItems = <T extends { path: string; permissions?: string[] }>(
    items: T[]
  ): T[] => {
    return accessControlService.filterNavigationItems(items, userRoles);
  };

  const canAccessPage = (path: string): boolean => {
    return accessControlService.canAccessPage(path, userRoles);
  };

  const canAccessModule = (moduleId: string): boolean => {
    return accessControlService.canAccessModule(moduleId, userRoles);
  };

  const getAccessibleSearchTypes = (): string[] => {
    return accessControlService.getAccessibleSearchTypes(userRoles);
  };

  return {
    userRoles,
    filterNavigationItems,
    canAccessPage,
    canAccessModule,
    getAccessibleSearchTypes,
  };
};
