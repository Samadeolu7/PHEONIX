import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Star, Clock, Badge as BadgeIcon } from 'lucide-react';
import { NavigationModule, NavigationItem } from '../../types/navigation';
import { getModuleById } from '../../data/navigationModules';

interface ModuleSidebarProps {
  moduleId: string;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavigationGroupProps {
  title: string;
  items: NavigationItem[];
  isExpanded: boolean;
  onToggle: () => void;
  currentPath: string;
}

const NavigationGroup: React.FC<NavigationGroupProps> = ({
  title,
  items,
  isExpanded,
  onToggle,
  currentPath,
}) => {
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <span>{title}</span>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-1 pl-3">
          {items.map(item => {
            const isActive = currentPath === item.path;
            const IconComponent = item.icon;

            return (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-l-2 border-blue-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {IconComponent && <IconComponent className="h-4 w-4 flex-shrink-0" />}
                <span className="flex-1 truncate">{item.title}</span>

                <div className="flex items-center gap-1">
                  {item.isNew && (
                    <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                      New
                    </span>
                  )}
                  {item.isEnhanced && (
                    <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                      Enhanced
                    </span>
                  )}
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-xs rounded-full ${
                        item.badge.type === 'error'
                          ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          : item.badge.type === 'warning'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                            : item.badge.type === 'success'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                      }`}
                    >
                      {item.badge.count}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ModuleSidebar: React.FC<ModuleSidebarProps> = ({
  moduleId,
  className = '',
  collapsed = false,
  onToggleCollapse,
}) => {
  const location = useLocation();
  const module = getModuleById(moduleId);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    core: true,
    management: true,
    reports: true,
    admin: true,
  });

  if (!module) {
    return null;
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Group navigation items by category for better organization
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, NavigationItem[]> = {
      core: [],
      management: [],
      reports: [],
      admin: [],
    };

    module.children.forEach(item => {
      // Categorize items based on their purpose
      if (item.path.includes('/dashboard') || item.path.includes('/overview')) {
        groups.core.push(item);
      } else if (
        item.path.includes('/reports') ||
        item.path.includes('/analytics') ||
        item.path.includes('/analysis')
      ) {
        groups.reports.push(item);
      } else if (
        item.path.includes('/admin') ||
        item.path.includes('/settings') ||
        item.path.includes('/config')
      ) {
        groups.admin.push(item);
      } else {
        groups.management.push(item);
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [module.children]);

  const getGroupTitle = (groupId: string): string => {
    switch (groupId) {
      case 'core':
        return 'Dashboard & Overview';
      case 'management':
        return 'Management';
      case 'reports':
        return 'Reports & Analytics';
      case 'admin':
        return 'Administration';
      default:
        return groupId;
    }
  };

  if (collapsed) {
    return (
      <div
        className={`w-16 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 ${className}`}
      >
        <div className="p-4">
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="space-y-2 px-2">
          {module.children.slice(0, 6).map(item => {
            const isActive = location.pathname === item.path;
            const IconComponent = item.icon;

            return (
              <Link
                key={item.id}
                to={item.path}
                className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors relative ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                title={item.title}
              >
                {IconComponent && <IconComponent className="h-5 w-5" />}
                {item.badge && item.badge.count > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {item.badge.count > 9 ? '9+' : item.badge.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Module Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${module.color} flex items-center justify-center`}>
              <module.icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {module.title}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {module.description}
              </p>
            </div>
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-gray-500 rotate-180" />
            </button>
          )}
        </div>

        {/* Module Stats */}
        {module.stats && module.stats.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {module.stats.slice(0, 4).map((stat, index) => (
              <div key={index} className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                  {stat.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="p-4 space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
        {groupedItems.map(([groupId, items]) => (
          <NavigationGroup
            key={groupId}
            title={getGroupTitle(groupId)}
            items={items}
            isExpanded={expandedGroups[groupId]}
            onToggle={() => toggleGroup(groupId)}
            currentPath={location.pathname}
          />
        ))}
      </div>

      {/* Quick Actions Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="space-y-2">
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <Star className="h-4 w-4" />
            <span>Bookmarks</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <Clock className="h-4 w-4" />
            <span>Recent</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModuleSidebar;
