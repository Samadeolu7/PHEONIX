// Functional Menu System - Complete navigation system organized by functional categories
// Implements conditional menu rendering based on user roles

import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Search, Menu, X, Home, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BRAND } from '../../constants/brand';
import { FunctionalCategory } from '../../types/permissions';
import {
  getNavigationStructure,
  RouteMapping,
  getAllCategories,
  canUserAccessRoute,
} from '../../utils/routeMapping';
import { FunctionalNavigation } from './FunctionalNavigation';

// Main menu system component
interface FunctionalMenuSystemProps {
  className?: string;
  variant?: 'sidebar' | 'header' | 'mobile';
  collapsible?: boolean;
  showSearch?: boolean;
  showUserInfo?: boolean;
}

export const FunctionalMenuSystem: React.FC<FunctionalMenuSystemProps> = ({
  className = '',
  variant = 'sidebar',
  collapsible = true,
  showSearch = true,
  showUserInfo = true,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get navigation structure for current user
  const navigationStructure = getNavigationStructure(user?.role || null);
  const allRoutes = Object.values(navigationStructure).flat();

  // Filter routes based on search query
  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) return allRoutes;

    return allRoutes.filter(
      route =>
        route.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        route.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        route.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allRoutes, searchQuery]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleRouteSelect = (route: RouteMapping) => {
    navigate(route.path);
    setIsMobileMenuOpen(false);
  };

  // Sidebar variant
  if (variant === 'sidebar') {
    return (
      <div className={`functional-menu-sidebar ${isCollapsed ? 'collapsed' : ''} ${className}`}>
        <div className="flex flex-col h-full bg-white border-r border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            {!isCollapsed && (
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
                <span className="font-semibold text-gray-900">Phoenix ERP</span>
              </div>
            )}
            {collapsible && (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1 rounded-md hover:bg-gray-100"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Search */}
          {showSearch && !isCollapsed && (
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search pages..."
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto">
            {searchQuery ? (
              <SearchResults
                routes={filteredRoutes}
                onRouteSelect={handleRouteSelect}
                currentPath={location.pathname}
                collapsed={isCollapsed}
              />
            ) : (
              <FunctionalNavigation
                className="p-4"
                collapsible={!isCollapsed}
                showIcons={true}
                showDescriptions={!isCollapsed}
                onNavigate={handleRouteSelect}
              />
            )}
          </div>

          {/* User Info */}
          {showUserInfo && !isCollapsed && (
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 font-medium text-sm">
                      {user?.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user?.name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500">{user?.role || 'No Role'}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Header variant
  if (variant === 'header') {
    return (
      <header className={`functional-menu-header bg-white border-b border-gray-200 ${className}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <img
                  src={BRAND.logoUrl}
                  alt="Example finance"
                  className="w-8 h-8 rounded-full object-contain"
                  style={{ border: '2px solid #b79758', background: '#0a1857', padding: '2px' }}
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="font-semibold" style={{ color: '#0a1857' }}>
                  {BRAND.systemLabel}
                </span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex space-x-8">
              {Object.entries(navigationStructure).map(([category, routes]) => (
                <CategoryDropdown
                  key={category}
                  category={category as FunctionalCategory}
                  routes={routes}
                  onRouteSelect={handleRouteSelect}
                  currentPath={location.pathname}
                />
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              {showSearch && (
                <div className="relative hidden md:block">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                  />
                </div>
              )}

              {showUserInfo && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">{user?.name}</span>
                  <span className="text-xs text-gray-500">({user?.role})</span>
                  <button onClick={handleLogout} className="p-2 rounded-md hover:bg-gray-100">
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-md hover:bg-gray-100"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200">
            <div className="px-4 py-2 space-y-1">
              <FunctionalNavigation
                collapsible={false}
                showIcons={true}
                showDescriptions={false}
                onNavigate={path => {
                  navigate(path);
                  setIsMobileMenuOpen(false);
                }}
              />
            </div>
          </div>
        )}
      </header>
    );
  }

  // Mobile variant
  if (variant === 'mobile') {
    return (
      <div className={`functional-menu-mobile ${className}`}>
        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-black bg-opacity-25"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="fixed top-0 left-0 bottom-0 w-80 bg-white shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <span className="font-semibold text-gray-900">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-md hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <FunctionalNavigation
                  className="p-4"
                  collapsible={true}
                  showIcons={true}
                  showDescriptions={true}
                  onNavigate={path => {
                    navigate(path);
                    setIsMobileMenuOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Mobile menu trigger */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>
    );
  }

  return null;
};

// Category dropdown for header variant
interface CategoryDropdownProps {
  category: FunctionalCategory;
  routes: RouteMapping[];
  onRouteSelect: (route: RouteMapping) => void;
  currentPath: string;
}

const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  category,
  routes,
  onRouteSelect,
  currentPath,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveRoute = routes.some(
    route => route.path === currentPath || currentPath.startsWith(route.path + '/')
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          hasActiveRoute
            ? 'text-blue-700 bg-blue-50'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        <span>{category}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50">
          <div className="py-1">
            {routes.map((route, index) => (
              <button
                key={`${route.path}-${index}`}
                onClick={() => {
                  onRouteSelect(route);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                  route.path === currentPath || currentPath.startsWith(route.path + '/')
                    ? 'text-blue-700 bg-blue-50'
                    : 'text-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{route.title}</span>
                  {route.isNew && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      New
                    </span>
                  )}
                </div>
                {route.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{route.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Search results component
interface SearchResultsProps {
  routes: RouteMapping[];
  onRouteSelect: (route: RouteMapping) => void;
  currentPath: string;
  collapsed?: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  routes,
  onRouteSelect,
  currentPath,
  collapsed = false,
}) => {
  if (routes.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-sm">No pages found</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Search Results ({routes.length})
      </h3>
      {routes.map((route, index) => {
        const isActive = route.path === currentPath || currentPath.startsWith(route.path + '/');

        return (
          <button
            key={`${route.path}-${index}`}
            onClick={() => onRouteSelect(route)}
            className={`w-full text-left p-3 rounded-md transition-colors ${
              isActive
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate">{route.title}</h4>
                <p className="text-xs text-gray-500 mt-1">{route.category}</p>
                {!collapsed && route.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{route.description}</p>
                )}
              </div>
              {route.isNew && (
                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  New
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default FunctionalMenuSystem;
