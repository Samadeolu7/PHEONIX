// Hook for module-specific navigation functionality
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { NavigationModule, NavigationItem, BreadcrumbItem } from '../types/navigation';
import { navigationService } from '../services/navigationService';
import { ContextualNavigation } from '../data/contextualNavigation';
import { WorkflowDefinition } from '../components/navigation/WorkflowNavigation';

export interface UseModuleNavigationReturn {
  // Current navigation state
  currentModule: NavigationModule | undefined;
  currentItem: NavigationItem | undefined;
  breadcrumbs: BreadcrumbItem[];

  // Module navigation
  modules: NavigationModule[];
  getModule: (moduleId: string) => NavigationModule | undefined;
  getModuleItems: (moduleId: string) => NavigationItem[];

  // Contextual navigation
  contextualNavigation: ContextualNavigation | undefined;
  relatedLinks: any[];
  shortcuts: any[];
  workflowSteps: any[];

  // Workflows
  moduleWorkflows: WorkflowDefinition[];
  getWorkflow: (workflowId: string) => WorkflowDefinition | undefined;

  // Bookmarks
  bookmarks: string[];
  bookmarkedItems: Array<{ path: string; title: string; module: string }>;
  isBookmarked: (path: string) => boolean;
  addBookmark: (path: string) => void;
  removeBookmark: (path: string) => void;
  toggleBookmark: (path: string) => void;

  // Recent pages
  recentPages: Array<{ path: string; title: string; timestamp: Date }>;
  addRecentPage: (path: string, title: string) => void;
  clearRecentPages: () => void;

  // Search
  searchResults: Array<{
    item: NavigationItem;
    module: NavigationModule;
    relevance: number;
  }>;
  searchNavigation: (query: string) => void;
  clearSearch: () => void;

  // Quick actions
  quickActions: NavigationItem[];
  moduleStats: Array<{ label: string; value: string | number }>;

  // Analytics
  navigationAnalytics: {
    totalModules: number;
    totalItems: number;
    newItems: number;
    enhancedItems: number;
    bookmarkedItems: number;
    recentPagesCount: number;
  };
}

export const useModuleNavigation = (
  userPermissions: string[] = [],
  moduleId?: string
): UseModuleNavigationReturn => {
  const location = useLocation();
  const [searchResults, setSearchResults] = useState<
    Array<{
      item: NavigationItem;
      module: NavigationModule;
      relevance: number;
    }>
  >([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [recentPages, setRecentPages] = useState<
    Array<{ path: string; title: string; timestamp: Date }>
  >([]);

  // Get filtered modules based on user permissions
  const modules = useMemo(() => {
    return navigationService.getModulesForUser(userPermissions);
  }, [userPermissions]);

  // Get current module and item based on current path
  const { currentModule, currentItem } = useMemo(() => {
    const navItem = navigationService.getNavigationItem(location.pathname);
    return {
      currentModule: navItem?.module,
      currentItem: navItem?.item,
    };
  }, [location.pathname]);

  // Generate breadcrumbs for current path
  const breadcrumbs = useMemo(() => {
    return navigationService.generateBreadcrumbs(location.pathname);
  }, [location.pathname]);

  // Get contextual navigation for current path
  const contextualNavigation = useMemo(() => {
    return navigationService.getContextualNavigation(location.pathname);
  }, [location.pathname]);

  // Extract contextual navigation components
  const { relatedLinks, shortcuts, workflowSteps } = useMemo(() => {
    return {
      relatedLinks: contextualNavigation?.relatedLinks || [],
      shortcuts: contextualNavigation?.shortcuts || [],
      workflowSteps: contextualNavigation?.workflowSteps || [],
    };
  }, [contextualNavigation]);

  // Get workflows for current or specified module
  const moduleWorkflows = useMemo(() => {
    const targetModuleId = moduleId || currentModule?.id;
    return targetModuleId ? navigationService.getWorkflowsForModule(targetModuleId) : [];
  }, [moduleId, currentModule?.id]);

  // Get quick actions for current or specified module
  const quickActions = useMemo(() => {
    const targetModuleId = moduleId || currentModule?.id;
    return targetModuleId ? navigationService.getQuickActionsForModule(targetModuleId) : [];
  }, [moduleId, currentModule?.id]);

  // Get module stats for current or specified module
  const moduleStats = useMemo(() => {
    const targetModuleId = moduleId || currentModule?.id;
    return targetModuleId ? navigationService.getModuleStats(targetModuleId) : [];
  }, [moduleId, currentModule?.id]);

  // Get bookmarked items
  const bookmarkedItems = useMemo(() => {
    return navigationService.getBookmarkedItems();
  }, [bookmarks]);

  // Get navigation analytics
  const navigationAnalytics = useMemo(() => {
    return navigationService.getNavigationAnalytics();
  }, [modules, bookmarks, recentPages]);

  // Load initial data
  useEffect(() => {
    setBookmarks(navigationService.getBookmarks());
    setRecentPages(navigationService.getRecentPages());
  }, []);

  // Add current page to recent pages when location changes
  useEffect(() => {
    if (currentItem) {
      navigationService.addRecentPage(location.pathname, currentItem.title);
      setRecentPages(navigationService.getRecentPages());
    }
  }, [location.pathname, currentItem]);

  // Navigation functions
  const getModule = (moduleId: string) => {
    return navigationService.getModule(moduleId);
  };

  const getModuleItems = (moduleId: string) => {
    return navigationService.getNavigationItemsByModule(moduleId);
  };

  const getWorkflow = (workflowId: string) => {
    return navigationService.getWorkflow(workflowId);
  };

  // Bookmark functions
  const isBookmarked = (path: string) => {
    return navigationService.isBookmarked(path);
  };

  const addBookmark = (path: string) => {
    navigationService.addBookmark(path);
    setBookmarks(navigationService.getBookmarks());
  };

  const removeBookmark = (path: string) => {
    navigationService.removeBookmark(path);
    setBookmarks(navigationService.getBookmarks());
  };

  const toggleBookmark = (path: string) => {
    if (isBookmarked(path)) {
      removeBookmark(path);
    } else {
      addBookmark(path);
    }
  };

  // Recent pages functions
  const addRecentPage = (path: string, title: string) => {
    navigationService.addRecentPage(path, title);
    setRecentPages(navigationService.getRecentPages());
  };

  const clearRecentPages = () => {
    navigationService.clearRecentPages();
    setRecentPages([]);
  };

  // Search functions
  const searchNavigation = (query: string) => {
    if (query.trim()) {
      const results = navigationService.searchNavigation(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const clearSearch = () => {
    setSearchResults([]);
  };

  return {
    // Current navigation state
    currentModule,
    currentItem,
    breadcrumbs,

    // Module navigation
    modules,
    getModule,
    getModuleItems,

    // Contextual navigation
    contextualNavigation,
    relatedLinks,
    shortcuts,
    workflowSteps,

    // Workflows
    moduleWorkflows,
    getWorkflow,

    // Bookmarks
    bookmarks,
    bookmarkedItems,
    isBookmarked,
    addBookmark,
    removeBookmark,
    toggleBookmark,

    // Recent pages
    recentPages,
    addRecentPage,
    clearRecentPages,

    // Search
    searchResults,
    searchNavigation,
    clearSearch,

    // Quick actions
    quickActions,
    moduleStats,

    // Analytics
    navigationAnalytics,
  };
};
