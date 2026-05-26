import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Star,
  Clock,
  Search,
  Filter,
  Grid,
  List,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useModuleNavigation } from '../hooks/useModuleNavigation';
import ModuleSidebar from '../components/navigation/ModuleSidebar';
import ContextualNavigation from '../components/navigation/ContextualNavigation';
import WorkflowNavigation, {
  workflowDefinitions,
} from '../components/navigation/WorkflowNavigation';
import { navigationModules } from '../data/navigationModules';

const ModuleNavigationDemoPage: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState<string>('financial');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('student-fee-collection');

  const navigation = useModuleNavigation(['admin.users.view', 'admin.audit.view'], selectedModule);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    navigation.searchNavigation(query);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Module-Specific Navigation Demo
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Comprehensive navigation structures for Financial Management, Client Services,
              Operations, and Administration
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search navigation..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Module Sidebar */}
        <ModuleSidebar
          moduleId={selectedModule}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Module Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Select Module to Explore
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {navigationModules.map(module => (
                  <button
                    key={module.id}
                    onClick={() => setSelectedModule(module.id)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedModule === module.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`w-8 h-8 rounded-lg ${module.color} flex items-center justify-center`}
                      >
                        <module.icon className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {module.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-left">
                      {module.description}
                    </p>
                    <div className="mt-3 text-xs text-gray-400">{module.children.length} items</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Current Module Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Module Details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Module Navigation Items */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Navigation Items ({navigation.getModuleItems(selectedModule).length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {navigation.getModuleItems(selectedModule).map(item => (
                      <Link
                        key={item.id}
                        to={item.path}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          {item.icon && <item.icon className="h-4 w-4 text-gray-500" />}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {item.title}
                              </span>
                              {item.isNew && (
                                <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                                  New
                                </span>
                              )}
                              {item.isEnhanced && (
                                <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                                  Enhanced
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {item.path}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.badge && (
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
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
                          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Workflow Navigation */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Workflow Navigation
                    </h3>
                    <select
                      value={selectedWorkflow}
                      onChange={e => setSelectedWorkflow(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      {workflowDefinitions.map(workflow => (
                        <option key={workflow.id} value={workflow.id}>
                          {workflow.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  {workflowDefinitions.find(w => w.id === selectedWorkflow) && (
                    <WorkflowNavigation
                      workflow={workflowDefinitions.find(w => w.id === selectedWorkflow)!}
                      orientation="vertical"
                      showProgress={true}
                    />
                  )}
                </div>

                {/* Search Results */}
                {navigation.searchResults.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Search Results ({navigation.searchResults.length})
                    </h3>
                    <div className="space-y-2">
                      {navigation.searchResults.slice(0, 10).map((result, index) => (
                        <Link
                          key={`${result.item.id}-${index}`}
                          to={result.item.path}
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {result.item.icon && (
                              <result.item.icon className="h-4 w-4 text-gray-500" />
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {result.item.title}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {result.module.title} • Relevance: {result.relevance}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar Information */}
              <div className="space-y-6">
                {/* Module Stats */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Module Statistics
                  </h3>
                  <div className="space-y-3">
                    {navigation.moduleStats.map((stat, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {stat.label}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Quick Actions
                  </h3>
                  <div className="space-y-2">
                    {navigation.quickActions.map(action => (
                      <Link
                        key={action.id}
                        to={action.path}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        {action.icon && <action.icon className="h-4 w-4 text-gray-500" />}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {action.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Bookmarks */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Bookmarks ({navigation.bookmarks.length})
                  </h3>
                  {navigation.bookmarkedItems.length > 0 ? (
                    <div className="space-y-2">
                      {navigation.bookmarkedItems.slice(0, 5).map((bookmark, index) => (
                        <Link
                          key={index}
                          to={bookmark.path}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Star className="h-4 w-4 text-yellow-500" />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {bookmark.title}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {bookmark.module}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No bookmarks yet</p>
                  )}
                </div>

                {/* Recent Pages */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Recent Pages ({navigation.recentPages.length})
                  </h3>
                  {navigation.recentPages.length > 0 ? (
                    <div className="space-y-2">
                      {navigation.recentPages.slice(0, 5).map((page, index) => (
                        <Link
                          key={index}
                          to={page.path}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Clock className="h-4 w-4 text-gray-400" />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {page.title}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {page.timestamp.toLocaleTimeString()}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No recent pages</p>
                  )}
                </div>

                {/* Navigation Analytics */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Navigation Analytics
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Total Modules
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {navigation.navigationAnalytics.totalModules}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total Items</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {navigation.navigationAnalytics.totalItems}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">New Items</span>
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        {navigation.navigationAnalytics.newItems}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Enhanced Items
                      </span>
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {navigation.navigationAnalytics.enhancedItems}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contextual Navigation Demo */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Contextual Navigation Example
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                This shows how contextual navigation would appear on specific pages with related
                links, shortcuts, and workflow steps.
              </p>
              <ContextualNavigation />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleNavigationDemoPage;
