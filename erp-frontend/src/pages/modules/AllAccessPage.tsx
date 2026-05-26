// src/pages/all-access/AllAccessPage.tsx
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { FEATURE_REGISTRY, FeatureCard } from '../../config/featureRegistry';
import {
  Grid,
  Search,
  ArrowLeft,
  Filter,
  X,
  FolderOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Module color mapping for visual distinction
const MODULE_COLORS = {
  financial: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    hover: 'hover:border-blue-300',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
    light: '#3b82f620',
    medium: '#3b82f6',
  },
  'client-services': {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    hover: 'hover:border-green-300',
    iconBg: 'bg-green-100',
    iconText: 'text-green-600',
    light: '#10b98120',
    medium: '#10b981',
  },
  operations: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    hover: 'hover:border-purple-300',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
    light: '#8b5cf620',
    medium: '#8b5cf6',
  },
  administration: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    hover: 'hover:border-orange-300',
    iconBg: 'bg-orange-100',
    iconText: 'text-orange-600',
    light: '#f9731620',
    medium: '#f97316',
  },
};

// Module display names
const MODULE_NAMES = {
  financial: 'Financial Management',
  'client-services': 'Client Services',
  operations: 'Operations',
  administration: 'Administration',
};

// Roles that bypass all permission checks
const SUPERUSER_ROLES = ['Director', 'Principal'];

export const AllAccessPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const { selectedRole } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [groupByModule, setGroupByModule] = useState(true);

  // Director / Principal see every feature — no permission check needed
  const isSuperUser = selectedRole ? SUPERUSER_ROLES.includes(selectedRole) : false;

  // Get all accessible features across ALL modules
  const accessibleFeatures = useMemo(() => {
    return FEATURE_REGISTRY.filter(
      feature => isSuperUser || hasPermission(feature.requiredPermission)
    );
  }, [isSuperUser, hasPermission]);

  // Get unique modules from accessible features
  const availableModules = useMemo(() => {
    const modules = new Set(accessibleFeatures.map(f => f.moduleId));
    return Array.from(modules);
  }, [accessibleFeatures]);

  // Get unique categories based on selected module
  const availableCategories = useMemo(() => {
    let features = accessibleFeatures;
    if (selectedModule !== 'all') {
      features = features.filter(f => f.moduleId === selectedModule);
    }
    const categories = new Set(features.map(f => f.category));
    return Array.from(categories).sort();
  }, [accessibleFeatures, selectedModule]);

  // Filter features based on search, module, and category
  const filteredFeatures = useMemo(() => {
    let filtered = accessibleFeatures;

    // Apply module filter
    if (selectedModule !== 'all') {
      filtered = filtered.filter(f => f.moduleId === selectedModule);
    }

    // Apply category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(f => f.category === selectedCategory);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        f =>
          f.title.toLowerCase().includes(term) ||
          f.description.toLowerCase().includes(term) ||
          f.category.toLowerCase().includes(term) ||
          f.path.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [accessibleFeatures, selectedModule, selectedCategory, searchTerm]);

  // Group features by module if grouping is enabled
  const groupedFeatures = useMemo(() => {
    if (!groupByModule) {
      return { 'All Features': filteredFeatures };
    }

    return filteredFeatures.reduce(
      (acc, feature) => {
        const moduleName = MODULE_NAMES[feature.moduleId] || feature.moduleId;
        if (!acc[moduleName]) {
          acc[moduleName] = [];
        }
        acc[moduleName].push(feature);
        return acc;
      },
      {} as Record<string, FeatureCard[]>
    );
  }, [filteredFeatures, groupByModule]);

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedModule('all');
    setSelectedCategory('all');
  };

  // Get module color for a feature
  const getModuleColor = (moduleId: string) => {
    return MODULE_COLORS[moduleId as keyof typeof MODULE_COLORS] || MODULE_COLORS.operations;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/dashboard/role-based"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">All Access</h1>
              <p className="mt-2 text-lg text-gray-600">
                Search and access every feature available to your role
              </p>
            </div>
            <div className="text-sm text-gray-500">
              {accessibleFeatures.length} total features • {filteredFeatures.length} shown
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search by title, description, category, or path..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Filter Toggle and Group Toggle */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center text-sm text-gray-600 hover:text-gray-900"
              >
                <Filter className="h-4 w-4 mr-1" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                {showFilters ? (
                  <ChevronUp className="h-4 w-4 ml-1" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-1" />
                )}
              </button>

              <button
                onClick={() => setGroupByModule(!groupByModule)}
                className="flex items-center text-sm text-gray-600 hover:text-gray-900"
              >
                <FolderOpen className="h-4 w-4 mr-1" />
                {groupByModule ? 'Ungroup' : 'Group by Module'}
              </button>
            </div>

            {/* Filter Options */}
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                {/* Module Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Module</label>
                  <select
                    value={selectedModule}
                    onChange={e => {
                      setSelectedModule(e.target.value);
                      setSelectedCategory('all'); // Reset category when module changes
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Modules</option>
                    {availableModules.map(moduleId => (
                      <option key={moduleId} value={moduleId}>
                        {MODULE_NAMES[moduleId as keyof typeof MODULE_NAMES] || moduleId}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={availableCategories.length === 0}
                  >
                    <option value="all">All Categories</option>
                    {availableCategories.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Active Filters */}
            {(selectedModule !== 'all' || selectedCategory !== 'all' || searchTerm) && (
              <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">Active filters:</span>

                {selectedModule !== 'all' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Module:{' '}
                    {MODULE_NAMES[selectedModule as keyof typeof MODULE_NAMES] || selectedModule}
                    <button
                      onClick={() => setSelectedModule('all')}
                      className="ml-1 hover:text-blue-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {selectedCategory !== 'all' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Category: {selectedCategory}
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className="ml-1 hover:text-green-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {searchTerm && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Search: "{searchTerm}"
                    <button
                      onClick={() => setSearchTerm('')}
                      className="ml-1 hover:text-purple-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-500">
          Showing {filteredFeatures.length} of {accessibleFeatures.length} features
        </div>

        {/* Features Grid - Grouped by Module */}
        {Object.entries(groupedFeatures).map(([groupName, features]) => (
          <div key={groupName} className="mb-8">
            {groupByModule && (
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">
                {groupName}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({features.length} features)
                </span>
              </h2>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map(feature => {
                const Icon = feature.icon;
                const colors = getModuleColor(feature.moduleId);

                return (
                  <Link
                    key={feature.id}
                    to={feature.path}
                    className={`group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 ${colors.hover}`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div
                          className={`w-10 h-10 ${colors.iconBg} rounded-lg flex items-center justify-center ${colors.iconText} group-hover:scale-110 transition-transform duration-200`}
                        >
                          <Icon size={20} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {feature.title}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                          {feature.description}
                        </p>

                        {/* Module and Category Tags */}
                        <div className="flex items-center space-x-2 mt-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
                          >
                            {MODULE_NAMES[feature.moduleId] || feature.moduleId}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {feature.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* No Results State */}
        {filteredFeatures.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No features found</h3>
            <p className="text-gray-600 mb-4">Try adjusting your search or filter criteria</p>
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
