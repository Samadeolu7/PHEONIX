// Functional Navigation Component - Organizes navigation by functional categories
// Based on Phoenix Software Access Table requirements

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  Package,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FunctionalCategory } from '../../types/permissions';
import { getNavigationStructure, RouteMapping } from '../../utils/routeMapping';

// Category icons mapping
const CATEGORY_ICONS: Record<FunctionalCategory, React.ComponentType<any>> = {
  'User Management': Users,
  'Financial Operations': DollarSign,
  'Client Management': Users,
  'Reports & Analytics': BarChart3,
  Operations: Package,
  'System Administration': Settings,
};

// Category colors for visual distinction
const CATEGORY_COLORS: Record<FunctionalCategory, string> = {
  'User Management': 'text-blue-600 bg-blue-50 border-blue-200',
  'Financial Operations': 'text-green-600 bg-green-50 border-green-200',
  'Client Management': 'text-purple-600 bg-purple-50 border-purple-200',
  'Reports & Analytics': 'text-orange-600 bg-orange-50 border-orange-200',
  Operations: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  'System Administration': 'text-gray-600 bg-gray-50 border-gray-200',
};

interface FunctionalNavigationProps {
  className?: string;
  onNavigate?: (path: string) => void;
  collapsible?: boolean;
  showIcons?: boolean;
  showDescriptions?: boolean;
}

export const FunctionalNavigation: React.FC<FunctionalNavigationProps> = ({
  className = '',
  onNavigate,
  collapsible = true,
  showIcons = true,
  showDescriptions = false,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedCategories, setExpandedCategories] = useState<Set<FunctionalCategory>>(
    new Set(['Financial Operations', 'Client Management']) // Default expanded categories
  );

  // Get navigation structure based on user role
  const navigationStructure = getNavigationStructure(user?.role || null);

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.(path);
  };

  const toggleCategory = (category: FunctionalCategory) => {
    if (!collapsible) return;

    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const isRouteActive = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const getCategoryItemCount = (routes: RouteMapping[]): number => {
    // Count unique routes (some routes might have the same pageId)
    const uniquePaths = new Set(routes.map(route => route.path));
    return uniquePaths.size;
  };

  if (!user?.role || Object.keys(navigationStructure).length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        <p>No navigation items available for your role.</p>
      </div>
    );
  }

  return (
    <nav className={`functional-navigation ${className}`}>
      <div className="space-y-2">
        {Object.entries(navigationStructure).map(([category, routes]) => {
          const categoryKey = category as FunctionalCategory;
          const isExpanded = expandedCategories.has(categoryKey);
          const CategoryIcon = CATEGORY_ICONS[categoryKey];
          const categoryColorClass = CATEGORY_COLORS[categoryKey];
          const itemCount = getCategoryItemCount(routes);

          return (
            <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(categoryKey)}
                className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${categoryColorClass}`}
                disabled={!collapsible}
              >
                <div className="flex items-center space-x-3">
                  {showIcons && CategoryIcon && <CategoryIcon className="h-5 w-5" />}
                  <div className="text-left">
                    <h3 className="font-medium text-sm">{category}</h3>
                    <p className="text-xs opacity-75">{itemCount} items</p>
                  </div>
                </div>
                {collapsible && (
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                )}
              </button>

              {/* Category Items */}
              {(isExpanded || !collapsible) && (
                <div className="bg-white border-t border-gray-100">
                  {routes.map((route, index) => {
                    const isActive = isRouteActive(route.path);

                    return (
                      <button
                        key={`${route.path}-${index}`}
                        onClick={() => handleNavigate(route.path)}
                        className={`w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors border-l-4 ${
                          isActive
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-transparent text-gray-700'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-medium truncate">{route.title}</h4>
                              {route.isNew && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  New
                                </span>
                              )}
                              {route.isEnhanced && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Enhanced
                                </span>
                              )}
                            </div>
                            {showDescriptions && route.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {route.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Role Information */}
      <div className="mt-6 p-3 bg-gray-50 rounded-lg border">
        <div className="text-xs text-gray-600">
          <p className="font-medium">Current Role: {user.role}</p>
          <p className="mt-1">
            Access to {Object.values(navigationStructure).flat().length} pages across{' '}
            {Object.keys(navigationStructure).length} categories
          </p>
        </div>
      </div>
    </nav>
  );
};

// Compact version for sidebar use
export const CompactFunctionalNavigation: React.FC<FunctionalNavigationProps> = props => {
  return (
    <FunctionalNavigation
      {...props}
      showDescriptions={false}
      className={`compact-navigation ${props.className || ''}`}
    />
  );
};

// Category-specific navigation components
interface CategoryNavigationProps {
  category: FunctionalCategory;
  className?: string;
  onNavigate?: (path: string) => void;
}

export const CategoryNavigation: React.FC<CategoryNavigationProps> = ({
  category,
  className = '',
  onNavigate,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navigationStructure = getNavigationStructure(user?.role || null);
  const categoryRoutes = navigationStructure[category] || [];

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.(path);
  };

  const isRouteActive = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (categoryRoutes.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        <p>No {category.toLowerCase()} items available for your role.</p>
      </div>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[category];
  const categoryColorClass = CATEGORY_COLORS[category];

  return (
    <div className={`category-navigation ${className}`}>
      {/* Category Header */}
      <div className={`px-4 py-3 border-b ${categoryColorClass}`}>
        <div className="flex items-center space-x-3">
          {CategoryIcon && <CategoryIcon className="h-5 w-5" />}
          <h2 className="font-semibold text-lg">{category}</h2>
        </div>
      </div>

      {/* Category Items */}
      <div className="space-y-1 p-2">
        {categoryRoutes.map((route, index) => {
          const isActive = isRouteActive(route.path);

          return (
            <button
              key={`${route.path}-${index}`}
              onClick={() => handleNavigate(route.path)}
              className={`w-full px-3 py-2 text-left rounded-md transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">{route.title}</span>
                {route.isNew && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    New
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FunctionalNavigation;
