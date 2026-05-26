// Navigation service for module-specific navigation management
import { NavigationModule, NavigationItem, BreadcrumbItem } from '../types/navigation';
import { navigationModules } from '../data/navigationModules';
import { contextualNavigationMap, ContextualNavigation } from '../data/contextualNavigation';
import {
  workflowDefinitions,
  WorkflowDefinition,
} from '../components/navigation/WorkflowNavigation';

export class NavigationService {
  private static instance: NavigationService;
  private bookmarks: string[] = [];
  private recentPages: Array<{ path: string; title: string; timestamp: Date }> = [];

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  // Module Management
  public getModule(moduleId: string): NavigationModule | undefined {
    return navigationModules.find(module => module.id === moduleId);
  }

  public getModuleByPath(path: string): NavigationModule | undefined {
    return navigationModules.find(module =>
      module.children.some(item => path.startsWith(item.path))
    );
  }

  public getModulesForUser(userPermissions: string[]): NavigationModule[] {
    return navigationModules
      .map(module => ({
        ...module,
        children: module.children.filter(
          item =>
            !item.permissions ||
            item.permissions.some(permission => userPermissions.includes(permission))
        ),
      }))
      .filter(
        module =>
          !module.permissions ||
          module.permissions.some(permission => userPermissions.includes(permission))
      );
  }

  // Navigation Item Management
  public getNavigationItem(
    path: string
  ): { module: NavigationModule; item: NavigationItem } | undefined {
    for (const module of navigationModules) {
      const item = module.children.find(child => child.path === path);
      if (item) {
        return { module, item };
      }
    }
    return undefined;
  }

  public getNavigationItemsByModule(moduleId: string): NavigationItem[] {
    const module = this.getModule(moduleId);
    return module?.children || [];
  }

  // Breadcrumb Generation
  public generateBreadcrumbs(path: string): BreadcrumbItem[] {
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'Dashboard', path: '/' }];

    const navItem = this.getNavigationItem(path);
    if (navItem) {
      breadcrumbs.push({
        label: navItem.module.title,
        path: `/modules/${navItem.module.id}`,
      });
      breadcrumbs.push({
        label: navItem.item.title,
        path: navItem.item.path,
        isActive: true,
      });
    } else {
      // Fallback breadcrumb generation based on path segments
      const segments = path.split('/').filter(Boolean);
      let currentPath = '';

      segments.forEach((segment, index) => {
        currentPath += `/${segment}`;
        const isLast = index === segments.length - 1;

        breadcrumbs.push({
          label: this.formatSegmentLabel(segment),
          path: isLast ? undefined : currentPath,
          isActive: isLast,
        });
      });
    }

    return breadcrumbs;
  }

  private formatSegmentLabel(segment: string): string {
    return segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Contextual Navigation
  public getContextualNavigation(path: string): ContextualNavigation | undefined {
    // Try exact match first
    let contextual = contextualNavigationMap[path];
    if (contextual) return contextual;

    // Try partial matches
    const pathKeys = Object.keys(contextualNavigationMap);
    const partialMatch = pathKeys.find(key => path.startsWith(key));

    return partialMatch ? contextualNavigationMap[partialMatch] : undefined;
  }

  // Workflow Management
  public getWorkflowsForModule(moduleId: string): WorkflowDefinition[] {
    const categoryMap: Record<string, string> = {
      financial: 'financial',
      'client-services': 'student',
      operations: 'procurement',
    };

    const category = categoryMap[moduleId];
    if (!category) return [];

    return workflowDefinitions.filter(workflow => workflow.category === category);
  }

  public getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return workflowDefinitions.find(workflow => workflow.id === workflowId);
  }

  // Bookmarks Management
  public addBookmark(path: string): void {
    if (!this.bookmarks.includes(path)) {
      this.bookmarks.push(path);
      this.saveToStorage();
    }
  }

  public removeBookmark(path: string): void {
    this.bookmarks = this.bookmarks.filter(bookmark => bookmark !== path);
    this.saveToStorage();
  }

  public isBookmarked(path: string): boolean {
    return this.bookmarks.includes(path);
  }

  public getBookmarks(): string[] {
    return [...this.bookmarks];
  }

  public getBookmarkedItems(): Array<{ path: string; title: string; module: string }> {
    return this.bookmarks.map(path => {
      const navItem = this.getNavigationItem(path);
      return {
        path,
        title: navItem?.item.title || this.formatSegmentLabel(path.split('/').pop() || ''),
        module: navItem?.module.title || 'Unknown',
      };
    });
  }

  // Recent Pages Management
  public addRecentPage(path: string, title: string): void {
    // Remove existing entry if it exists
    this.recentPages = this.recentPages.filter(page => page.path !== path);

    // Add to beginning
    this.recentPages.unshift({
      path,
      title,
      timestamp: new Date(),
    });

    // Keep only last 10 pages
    this.recentPages = this.recentPages.slice(0, 10);
    this.saveToStorage();
  }

  public getRecentPages(): Array<{ path: string; title: string; timestamp: Date }> {
    return [...this.recentPages];
  }

  public clearRecentPages(): void {
    this.recentPages = [];
    this.saveToStorage();
  }

  // Search Functionality
  public searchNavigation(query: string): Array<{
    item: NavigationItem;
    module: NavigationModule;
    relevance: number;
  }> {
    const results: Array<{
      item: NavigationItem;
      module: NavigationModule;
      relevance: number;
    }> = [];

    const queryLower = query.toLowerCase();

    navigationModules.forEach(module => {
      module.children.forEach(item => {
        let relevance = 0;

        // Title match (highest relevance)
        if (item.title.toLowerCase().includes(queryLower)) {
          relevance += item.title.toLowerCase() === queryLower ? 100 : 50;
        }

        // Module title match
        if (module.title.toLowerCase().includes(queryLower)) {
          relevance += 25;
        }

        // Module description match
        if (module.description.toLowerCase().includes(queryLower)) {
          relevance += 15;
        }

        // Path match
        if (item.path.toLowerCase().includes(queryLower)) {
          relevance += 10;
        }

        if (relevance > 0) {
          results.push({ item, module, relevance });
        }
      });
    });

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  // Quick Actions
  public getQuickActionsForModule(moduleId: string): NavigationItem[] {
    const module = this.getModule(moduleId);
    if (!module) return [];

    // Return items marked as shortcuts or commonly used items
    return module.children
      .filter(
        item =>
          item.path.includes('/create') ||
          item.path.includes('/new') ||
          item.path.includes('/dashboard') ||
          item.isNew
      )
      .slice(0, 4);
  }

  // Module Statistics
  public getModuleStats(moduleId: string): Array<{ label: string; value: string | number }> {
    const module = this.getModule(moduleId);
    return module?.stats || [];
  }

  // Navigation Analytics
  public getNavigationAnalytics(): {
    totalModules: number;
    totalItems: number;
    newItems: number;
    enhancedItems: number;
    bookmarkedItems: number;
    recentPagesCount: number;
  } {
    const totalItems = navigationModules.reduce((sum, module) => sum + module.children.length, 0);
    const newItems = navigationModules.reduce(
      (sum, module) => sum + module.children.filter(item => item.isNew).length,
      0
    );
    const enhancedItems = navigationModules.reduce(
      (sum, module) => sum + module.children.filter(item => item.isEnhanced).length,
      0
    );

    return {
      totalModules: navigationModules.length,
      totalItems,
      newItems,
      enhancedItems,
      bookmarkedItems: this.bookmarks.length,
      recentPagesCount: this.recentPages.length,
    };
  }

  // Storage Management
  private loadFromStorage(): void {
    try {
      const bookmarks = localStorage.getItem('erp-navigation-bookmarks');
      if (bookmarks) {
        this.bookmarks = JSON.parse(bookmarks);
      }

      const recentPages = localStorage.getItem('erp-navigation-recent');
      if (recentPages) {
        this.recentPages = JSON.parse(recentPages).map((page: any) => ({
          ...page,
          timestamp: new Date(page.timestamp),
        }));
      }
    } catch (error) {
      console.warn('Failed to load navigation data from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('erp-navigation-bookmarks', JSON.stringify(this.bookmarks));
      localStorage.setItem('erp-navigation-recent', JSON.stringify(this.recentPages));
    } catch (error) {
      console.warn('Failed to save navigation data to storage:', error);
    }
  }
}

// Export singleton instance
export const navigationService = NavigationService.getInstance();
