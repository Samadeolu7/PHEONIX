// Navigation hook for managing navigation state and actions
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigationStore } from '../stores/navigationStore';
import { useBreadcrumbs } from '../components/navigation/BreadcrumbNavigation';
import { getNavigationItemByPath, navigationModules } from '../data/navigationModules';
import { BreadcrumbItem } from '../types/navigation';

export const useNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { generateBreadcrumbs } = useBreadcrumbs();

  const {
    currentModule,
    breadcrumbs,
    sidebarCollapsed,
    recentPages,
    bookmarks,
    setCurrentModule,
    setBreadcrumbs,
    addRecentPage,
    toggleSidebar,
    setSidebarCollapsed,
    toggleBookmark,
  } = useNavigationStore();

  // Update navigation state when route changes
  useEffect(() => {
    const pathname = location.pathname;

    // Find current module based on path
    const navigationMatch = getNavigationItemByPath(pathname);
    if (navigationMatch) {
      setCurrentModule(navigationMatch.module.id);

      // Add to recent pages
      addRecentPage(pathname, navigationMatch.item.title);

      // Generate and set breadcrumbs
      const autoBreadcrumbs = generateBreadcrumbs(pathname);
      const enhancedBreadcrumbs: BreadcrumbItem[] = [
        { label: navigationMatch.module.title, path: `/modules/${navigationMatch.module.id}` },
        ...autoBreadcrumbs,
      ];
      setBreadcrumbs(enhancedBreadcrumbs);
    } else {
      // Generate basic breadcrumbs for unknown routes
      const basicBreadcrumbs = generateBreadcrumbs(pathname);
      setBreadcrumbs(basicBreadcrumbs);
    }
  }, [location.pathname, setCurrentModule, setBreadcrumbs, addRecentPage, generateBreadcrumbs]);

  // Navigation helpers
  const navigateToModule = (moduleId: string) => {
    const module = navigationModules.find(m => m.id === moduleId);
    if (module && module.children.length > 0) {
      navigate(module.children[0].path);
    }
  };

  const navigateToPath = (path: string, title?: string) => {
    navigate(path);
    if (title) {
      addRecentPage(path, title);
    }
  };

  const goBack = () => {
    navigate(-1);
  };

  const goHome = () => {
    navigate('/');
  };

  // Breadcrumb helpers
  const updateBreadcrumbs = (newBreadcrumbs: BreadcrumbItem[]) => {
    setBreadcrumbs(newBreadcrumbs);
  };

  const addCustomBreadcrumb = (label: string, path?: string) => {
    const newBreadcrumb: BreadcrumbItem = {
      label,
      path,
      isActive: !path,
    };
    setBreadcrumbs([...breadcrumbs, newBreadcrumb]);
  };

  // Sidebar helpers
  const openSidebar = () => setSidebarCollapsed(false);
  const closeSidebar = () => setSidebarCollapsed(true);

  // Bookmark helpers
  const isBookmarked = (path: string) => bookmarks.includes(path);
  const addBookmark = (path: string) => {
    if (!isBookmarked(path)) {
      toggleBookmark(path);
    }
  };
  const removeBookmark = (path: string) => {
    if (isBookmarked(path)) {
      toggleBookmark(path);
    }
  };

  // Get current module data
  const getCurrentModule = () => {
    return currentModule ? navigationModules.find(m => m.id === currentModule) : null;
  };

  // Get navigation context for current page
  const getNavigationContext = () => {
    const currentModuleData = getCurrentModule();
    const navigationMatch = getNavigationItemByPath(location.pathname);

    return {
      module: currentModuleData,
      item: navigationMatch?.item,
      breadcrumbs,
      isBookmarked: isBookmarked(location.pathname),
    };
  };

  return {
    // State
    currentModule,
    breadcrumbs,
    sidebarCollapsed,
    recentPages,
    bookmarks,

    // Navigation actions
    navigateToModule,
    navigateToPath,
    goBack,
    goHome,

    // Breadcrumb actions
    updateBreadcrumbs,
    addCustomBreadcrumb,

    // Sidebar actions
    toggleSidebar,
    openSidebar,
    closeSidebar,

    // Bookmark actions
    isBookmarked,
    addBookmark,
    removeBookmark,
    toggleBookmark,

    // Helpers
    getCurrentModule,
    getNavigationContext,

    // Current location
    pathname: location.pathname,
  };
};
