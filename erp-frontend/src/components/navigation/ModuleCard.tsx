// ModuleCard component for displaying navigation modules
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, TrendingUp } from 'lucide-react';
import { NavigationModule, NavigationLayout } from '../../types/navigation';

interface ModuleCardProps {
  module: NavigationModule;
  layout?: NavigationLayout;
  showStats?: boolean;
  onNavigate?: (path: string) => void;
  className?: string;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  layout = 'grid',
  showStats = true,
  onNavigate,
  className = '',
}) => {
  const handleNavigation = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
  };

  const cardClasses =
    layout === 'grid'
      ? 'bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200'
      : 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center space-x-4 hover:shadow-md transition-shadow duration-200';

  const IconComponent = module.icon;

  if (layout === 'list') {
    return (
      <div className={`${cardClasses} ${className}`}>
        <div className={`p-3 rounded-lg ${module.color || 'bg-blue-100'}`}>
          <IconComponent className={`h-6 w-6 ${module.color ? 'text-white' : 'text-blue-600'}`} />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
            {module.badge && (
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  module.badge.type === 'error'
                    ? 'bg-red-100 text-red-800'
                    : module.badge.type === 'warning'
                      ? 'bg-yellow-100 text-yellow-800'
                      : module.badge.type === 'success'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                }`}
              >
                {module.badge.count}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">{module.description}</p>

          <div className="flex items-center space-x-4 mt-3">
            {module.children.slice(0, 3).map(item => (
              <Link
                key={item.id}
                to={item.path}
                onClick={() => handleNavigation(item.path)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
              >
                <span>{item.title}</span>
                {item.isNew && (
                  <span className="px-1 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                    New
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        <ArrowRight className="h-5 w-5 text-gray-400" />
      </div>
    );
  }

  return (
    <div className={`${cardClasses} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${module.color || 'bg-blue-100'}`}>
          <IconComponent className={`h-8 w-8 ${module.color ? 'text-white' : 'text-blue-600'}`} />
        </div>
        {module.badge && (
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              module.badge.type === 'error'
                ? 'bg-red-100 text-red-800'
                : module.badge.type === 'warning'
                  ? 'bg-yellow-100 text-yellow-800'
                  : module.badge.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-blue-100 text-blue-800'
            }`}
          >
            {module.badge.count}
          </span>
        )}
      </div>

      {/* Title and Description */}
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{module.title}</h3>
        <p className="text-sm text-gray-600">{module.description}</p>
      </div>

      {/* Quick Actions */}
      <div className="space-y-2 mb-4">
        {module.children.slice(0, 4).map(item => (
          <Link
            key={item.id}
            to={item.path}
            onClick={() => handleNavigation(item.path)}
            className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 transition-colors duration-150"
          >
            <div className="flex items-center space-x-2">
              {item.icon && <item.icon className="h-4 w-4 text-gray-500" />}
              <span className="text-sm font-medium text-gray-700">{item.title}</span>
              {item.isNew && (
                <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                  New
                </span>
              )}
              {item.isEnhanced && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                  Enhanced
                </span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </Link>
        ))}

        {module.children.length > 4 && (
          <div className="pt-2 border-t border-gray-100">
            <Link
              to={`/modules/${module.id}`}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1"
            >
              <span>View all {module.children.length} items</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Stats */}
      {showStats && module.stats && module.stats.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {module.stats.slice(0, 2).map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-lg font-semibold text-gray-900">{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
