// src/pages/all-access/AllAccessPage.tsx
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { FEATURE_REGISTRY, FeatureCard, isFeatureAccessible } from '../../config/featureRegistry';
import { BRAND } from '../../constants/brand';
import {
  Grid,
  Search,
  ArrowLeft,
  Filter,
  X,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';

// Per-module icon accent colors (Tailwind classes — must appear in source for JIT)
const MODULE_ICON_STYLES = {
  financial:         { iconBg: 'bg-amber-50',   iconText: 'text-amber-700'  },
  'client-services': { iconBg: 'bg-emerald-50',  iconText: 'text-emerald-700'},
  operations:        { iconBg: 'bg-indigo-50',   iconText: 'text-indigo-700' },
  administration:    { iconBg: 'bg-slate-100',   iconText: 'text-slate-700'  },
} as const;

// Module display names
const MODULE_NAMES = {
  financial: 'Financial Management',
  'client-services': 'Client Services',
  operations: 'Operations',
  administration: 'Administration',
};

export const AllAccessPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const { selectedRole } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [groupByModule, setGroupByModule] = useState(true);

  // Get all accessible features across ALL modules — shares the same
  // page-permission-matrix-first, legacy-code-fallback logic as the module
  // landing pages (getAccessibleFeatures), so a card's visibility here always
  // agrees with its visibility on its own module's page.
  const accessibleFeatures = useMemo(() => {
    return FEATURE_REGISTRY.filter(feature => isFeatureAccessible(feature, hasPermission, selectedRole));
  }, [hasPermission, selectedRole]);

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

  // Get module icon style for a feature
  const getModuleIconStyle = (moduleId: string) => {
    return MODULE_ICON_STYLES[moduleId as keyof typeof MODULE_ICON_STYLES] || MODULE_ICON_STYLES.operations;
  };

  return (
    <div className="min-h-screen" style={{ background: BRAND.colors.offWhite }}>
      {/* Navy gradient banner */}
      <div style={{ background: 'linear-gradient(135deg, #060e30 0%, #0a1857 60%, #162570 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
          <Link
            to="/dashboard/role-based"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-5 transition-opacity hover:opacity-75"
            style={{ color: BRAND.colors.goldLight }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(183,151,88,0.18)' }}>
                <Grid className="w-6 h-6" style={{ color: BRAND.colors.gold }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">All Access</h1>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Search and access every feature available to your role
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 hidden sm:block">
              <div className="text-3xl font-bold tabular-nums" style={{ color: BRAND.colors.gold }}>{accessibleFeatures.length}</div>
              <div className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>total features</div>
            </div>
          </div>
          <div className="h-px mt-6" style={{ background: 'linear-gradient(90deg, rgba(183,151,88,0.6), transparent)' }} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search + Filter bar */}
        <div className="bg-white rounded-2xl border mb-6 overflow-hidden" style={{ borderColor: '#e8e0d0' }}>
          {/* Search row */}
          <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid #f0ebe0' }}>
            <Search className="flex-shrink-0 w-5 h-5" style={{ color: BRAND.colors.textSecondary }} />
            <input
              type="text"
              placeholder="Search features by title, description, category or path…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm outline-none placeholder:text-gray-400"
              style={{ color: BRAND.colors.navyPrimary }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="flex-shrink-0 hover:opacity-70 transition-opacity">
                <X className="w-4 h-4" style={{ color: BRAND.colors.textSecondary }} />
              </button>
            )}
          </div>

          {/* Toolbar row */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-2" style={{ background: '#faf8f4' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-opacity hover:opacity-70"
              style={{ color: showFilters ? BRAND.colors.navyPrimary : BRAND.colors.textSecondary }}
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? 'Hide Filters' : 'Filters'}
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: BRAND.colors.textSecondary }}>
                {filteredFeatures.length} of {accessibleFeatures.length} shown
              </span>
              <button
                onClick={() => setGroupByModule(!groupByModule)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-opacity hover:opacity-70"
                style={{ color: BRAND.colors.textSecondary }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {groupByModule ? 'Ungroup' : 'Group'}
              </button>
            </div>
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div className="px-4 pb-4 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderTop: '1px solid #f0ebe0' }}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide mb-2" style={{ color: BRAND.colors.textSecondary }}>Module</label>
                <select
                  value={selectedModule}
                  onChange={e => { setSelectedModule(e.target.value); setSelectedCategory('all'); }}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                  style={{ borderColor: '#e8e0d0', color: BRAND.colors.navyPrimary }}
                >
                  <option value="all">All Modules</option>
                  {availableModules.map(moduleId => (
                    <option key={moduleId} value={moduleId}>
                      {MODULE_NAMES[moduleId as keyof typeof MODULE_NAMES] || moduleId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide mb-2" style={{ color: BRAND.colors.textSecondary }}>Category</label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                  style={{ borderColor: '#e8e0d0', color: BRAND.colors.navyPrimary }}
                  disabled={availableCategories.length === 0}
                >
                  <option value="all">All Categories</option>
                  {availableCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {(selectedModule !== 'all' || selectedCategory !== 'all' || searchTerm) && (
            <div className="px-4 pb-3 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #f0ebe0' }}>
              {selectedModule !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,24,87,0.08)', color: BRAND.colors.navyPrimary }}>
                  {MODULE_NAMES[selectedModule as keyof typeof MODULE_NAMES] || selectedModule}
                  <button onClick={() => setSelectedModule('all')} className="hover:opacity-60 transition-opacity ml-0.5"><X className="w-3 h-3" /></button>
                </span>
              )}
              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(183,151,88,0.15)', color: BRAND.colors.goldDark }}>
                  {selectedCategory}
                  <button onClick={() => setSelectedCategory('all')} className="hover:opacity-60 transition-opacity ml-0.5"><X className="w-3 h-3" /></button>
                </span>
              )}
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,24,87,0.06)', color: BRAND.colors.textSecondary }}>
                  &ldquo;{searchTerm}&rdquo;
                  <button onClick={() => setSearchTerm('')} className="hover:opacity-60 transition-opacity ml-0.5"><X className="w-3 h-3" /></button>
                </span>
              )}
              <button onClick={clearFilters} className="text-xs underline transition-opacity hover:opacity-60" style={{ color: BRAND.colors.textSecondary }}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Feature groups */}
        {Object.entries(groupedFeatures).map(([groupName, features]) => (
          <div key={groupName} className="mb-10">
            {groupByModule && (
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: BRAND.colors.gold }} />
                <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND.colors.navyPrimary }}>
                  {groupName}
                </h2>
                <div className="flex-1 h-px" style={{ background: '#e0d8cc' }} />
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(10,24,87,0.07)', color: BRAND.colors.textSecondary }}>
                  {features.length}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map(feature => {
                const Icon = feature.icon;
                const style = getModuleIconStyle(feature.moduleId);

                return (
                  <Link
                    key={feature.id}
                    to={feature.path}
                    className="group relative bg-white rounded-xl border p-5 hover:shadow-lg transition-all duration-200 flex items-start gap-4"
                    style={{ borderColor: '#e8e0d0' }}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${style.iconBg} ${style.iconText}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold" style={{ color: BRAND.colors.navyPrimary }}>
                          {feature.title}
                        </h3>
                        {groupByModule === false && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(10,24,87,0.07)', color: BRAND.colors.textSecondary }}>
                            {MODULE_NAMES[feature.moduleId as keyof typeof MODULE_NAMES] || feature.moduleId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: BRAND.colors.textSecondary }}>
                        {feature.description}
                      </p>
                      <div className="mt-2">
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(183,151,88,0.1)', color: BRAND.colors.goldDark }}>
                          {feature.category}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className="flex-shrink-0 w-4 h-4 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: BRAND.colors.gold }}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: `linear-gradient(90deg, ${BRAND.colors.gold}, transparent)` }}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* No results */}
        {filteredFeatures.length === 0 && (
          <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: BRAND.colors.border }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(10,24,87,0.06)' }}>
              <Search className="w-7 h-7" style={{ color: BRAND.colors.textSecondary }} />
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: BRAND.colors.navyPrimary }}>No features found</h3>
            <p className="text-sm mb-5" style={{ color: BRAND.colors.textSecondary }}>Try adjusting your search or filter criteria</p>
            <button
              onClick={clearFilters}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
              style={{ background: BRAND.colors.navyPrimary }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
