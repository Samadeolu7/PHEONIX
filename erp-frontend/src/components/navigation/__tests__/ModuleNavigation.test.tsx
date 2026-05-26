import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { navigationModules } from '../../../data/navigationModules';
import { contextualNavigationMap } from '../../../data/contextualNavigation';
import { workflowDefinitions } from '../WorkflowNavigation';
import { navigationService } from '../../../services/navigationService';
import { useModuleNavigation } from '../../../hooks/useModuleNavigation';
import ModuleSidebar from '../ModuleSidebar';
import ContextualNavigation from '../ContextualNavigation';

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

// Test component that uses the hook
const TestNavigationComponent: React.FC<{ moduleId?: string; userPermissions?: string[] }> = ({
  moduleId,
  userPermissions = [],
}) => {
  const navigation = useModuleNavigation(userPermissions, moduleId);

  return (
    <div data-testid="navigation-test">
      <div data-testid="current-module">{navigation.currentModule?.title || 'None'}</div>
      <div data-testid="modules-count">{navigation.modules.length}</div>
      <div data-testid="bookmarks-count">{navigation.bookmarks.length}</div>
      <div data-testid="recent-pages-count">{navigation.recentPages.length}</div>
      <div data-testid="quick-actions-count">{navigation.quickActions.length}</div>
      <div data-testid="workflows-count">{navigation.moduleWorkflows.length}</div>
    </div>
  );
};

describe('Module-Specific Navigation Structures', () => {
  beforeEach(() => {
    // Clear any stored data
    localStorage.clear();
  });

  describe('Navigation Modules Structure', () => {
    it('should have all required modules defined', () => {
      expect(navigationModules).toHaveLength(4);

      const moduleIds = navigationModules.map(m => m.id);
      expect(moduleIds).toContain('financial');
      expect(moduleIds).toContain('client-services');
      expect(moduleIds).toContain('operations');
      expect(moduleIds).toContain('administration');
    });

    it('should have comprehensive Financial Management module', () => {
      const financialModule = navigationModules.find(m => m.id === 'financial');
      expect(financialModule).toBeDefined();
      expect(financialModule?.title).toBe('Financial Management');
      expect(financialModule?.children.length).toBeGreaterThan(8);

      // Check for key financial navigation items
      const itemPaths = financialModule?.children.map(item => item.path) || [];
      expect(itemPaths).toContain('/accounts');
      expect(itemPaths).toContain('/receivables/dashboard');
      expect(itemPaths).toContain('/receivables/aging-report');
      expect(itemPaths).toContain('/receivables/collections');
      expect(itemPaths).toContain('/reports/financial/trial-balance');
    });

    it('should have comprehensive Client Services module', () => {
      const studentModule = navigationModules.find(m => m.id === 'client-services');
      expect(studentModule).toBeDefined();
      expect(studentModule?.title).toBe('Client Services');
      expect(studentModule?.children.length).toBeGreaterThan(10);

      // Check for key Client Services navigation items
      const itemPaths = studentModule?.children.map(item => item.path) || [];
      expect(itemPaths).toContain('/incomes/entitlements');
      expect(itemPaths).toContain('/incomes/fee-structures');
      expect(itemPaths).toContain('/incomes/discounts');
      expect(itemPaths).toContain('/clients');
      expect(itemPaths).toContain('/demo/bulk-invoice-wizard');
    });

    it('should have comprehensive Operations Management module', () => {
      const operationsModule = navigationModules.find(m => m.id === 'operations');
      expect(operationsModule).toBeDefined();
      expect(operationsModule?.title).toBe('Operations Management');
      expect(operationsModule?.children.length).toBeGreaterThan(15);

      // Check for key operations navigation items
      const itemPaths = operationsModule?.children.map(item => item.path) || [];
      expect(itemPaths).toContain('/procurement');
      expect(itemPaths).toContain('/procurement/requisitions');
      expect(itemPaths).toContain('/procurement/orders');
      expect(itemPaths).toContain('/inventory');
      expect(itemPaths).toContain('/procurement/suppliers');
    });

    it('should have comprehensive Administration module', () => {
      const adminModule = navigationModules.find(m => m.id === 'administration');
      expect(adminModule).toBeDefined();
      expect(adminModule?.title).toBe('Administration');
      expect(adminModule?.children.length).toBeGreaterThan(15);

      // Check for key administration navigation items
      const itemPaths = adminModule?.children.map(item => item.path) || [];
      expect(itemPaths).toContain('/admin/users');
      expect(itemPaths).toContain('/admin/roles');
      expect(itemPaths).toContain('/admin/branches');
      expect(itemPaths).toContain('/admin/audit');
      expect(itemPaths).toContain('/admin/settings');
    });
  });

  describe('Contextual Navigation', () => {
    it('should have contextual navigation for key pages', () => {
      expect(contextualNavigationMap['/receivables/dashboard']).toBeDefined();
      expect(contextualNavigationMap['/incomes/entitlements']).toBeDefined();
      expect(contextualNavigationMap['/procurement/requisitions']).toBeDefined();
      expect(contextualNavigationMap['/inventory']).toBeDefined();
      expect(contextualNavigationMap['/admin/users']).toBeDefined();
    });

    it('should provide related links and shortcuts', () => {
      const receivablesContext = contextualNavigationMap['/receivables/dashboard'];
      expect(receivablesContext.relatedLinks.length).toBeGreaterThan(0);
      expect(receivablesContext.shortcuts.length).toBeGreaterThan(0);
      expect(receivablesContext.workflowSteps?.length).toBeGreaterThan(0);
    });

    it('should provide workflow steps for process-oriented pages', () => {
      const procurementContext = contextualNavigationMap['/procurement/requisitions'];
      expect(procurementContext.workflowSteps?.length).toBeGreaterThan(3);

      const workflowSteps = procurementContext.workflowSteps || [];
      expect(workflowSteps.some(step => step.title.includes('Requisition'))).toBe(true);
      expect(workflowSteps.some(step => step.title.includes('Approval'))).toBe(true);
      expect(workflowSteps.some(step => step.title.includes('Purchase Order'))).toBe(true);
    });
  });

  describe('Workflow Definitions', () => {
    it('should have workflow definitions for different categories', () => {
      expect(workflowDefinitions.length).toBeGreaterThan(0);

      const categories = workflowDefinitions.map(w => w.category);
      expect(categories).toContain('financial');
      expect(categories).toContain('procurement');
    });

    it('should have comprehensive procurement workflow', () => {
      const procurementWorkflow = workflowDefinitions.find(w => w.id === 'procurement-cycle');
      expect(procurementWorkflow).toBeDefined();
      expect(procurementWorkflow?.steps.length).toBeGreaterThan(4);

      const stepTitles = procurementWorkflow?.steps.map(s => s.title) || [];
      expect(stepTitles).toContain('Create Requisition');
      expect(stepTitles).toContain('Get Approval');
      expect(stepTitles).toContain('Create Purchase Order');
      expect(stepTitles).toContain('Receive Goods');
      expect(stepTitles).toContain('Update Inventory');
    });

    it('should have comprehensive financial workflow', () => {
      const financialWorkflow = workflowDefinitions.find(w => w.id === 'student-fee-collection');
      expect(financialWorkflow).toBeDefined();
      expect(financialWorkflow?.steps.length).toBeGreaterThan(3);

      const stepTitles = financialWorkflow?.steps.map(s => s.title) || [];
      expect(stepTitles).toContain('Setup Fee Structure');
      expect(stepTitles).toContain('Create Entitlements');
      expect(stepTitles).toContain('Generate Invoices');
      expect(stepTitles).toContain('Track Payments');
    });
  });

  describe('Navigation Service', () => {
    it('should provide module lookup functionality', () => {
      const financialModule = navigationService.getModule('financial');
      expect(financialModule).toBeDefined();
      expect(financialModule?.title).toBe('Financial Management');
    });

    it('should provide navigation item lookup by path', () => {
      const navItem = navigationService.getNavigationItem('/receivables/dashboard');
      expect(navItem).toBeDefined();
      expect(navItem?.module.id).toBe('financial');
      expect(navItem?.item.title).toBe('Receivables Dashboard');
    });

    it('should generate breadcrumbs correctly', () => {
      const breadcrumbs = navigationService.generateBreadcrumbs('/receivables/dashboard');
      expect(breadcrumbs.length).toBeGreaterThan(1);
      expect(breadcrumbs[0].label).toBe('Dashboard');
      expect(breadcrumbs[breadcrumbs.length - 1].isActive).toBe(true);
    });

    it('should provide search functionality', () => {
      const results = navigationService.searchNavigation('receivables');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relevance).toBeGreaterThan(0);
    });

    it('should manage bookmarks', () => {
      const testPath = '/test/path';

      expect(navigationService.isBookmarked(testPath)).toBe(false);
      navigationService.addBookmark(testPath);
      expect(navigationService.isBookmarked(testPath)).toBe(true);
      navigationService.removeBookmark(testPath);
      expect(navigationService.isBookmarked(testPath)).toBe(false);
    });
  });

  describe('useModuleNavigation Hook', () => {
    it('should provide navigation data', () => {
      render(
        <TestWrapper>
          <TestNavigationComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('modules-count')).toHaveTextContent('4');
      expect(screen.getByTestId('navigation-test')).toBeInTheDocument();
    });

    it('should filter modules by permissions', () => {
      render(
        <TestWrapper>
          <TestNavigationComponent userPermissions={['admin.users.view']} />
        </TestWrapper>
      );

      // Should still show all modules but filter items within modules
      expect(screen.getByTestId('modules-count')).toHaveTextContent('4');
    });

    it('should provide module-specific data when moduleId is specified', () => {
      render(
        <TestWrapper>
          <TestNavigationComponent moduleId="financial" />
        </TestWrapper>
      );

      // Should provide quick actions and workflows for financial module
      expect(screen.getByTestId('navigation-test')).toBeInTheDocument();
    });
  });

  describe('ModuleSidebar Component', () => {
    it('should render module sidebar with navigation items', () => {
      render(
        <TestWrapper>
          <ModuleSidebar moduleId="financial" />
        </TestWrapper>
      );

      expect(screen.getByText('Financial Management')).toBeInTheDocument();
      expect(screen.getByText('Receivables Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument();
    });

    it('should show module stats', () => {
      render(
        <TestWrapper>
          <ModuleSidebar moduleId="financial" />
        </TestWrapper>
      );

      // Should show financial module stats
      expect(screen.getByText('₦2.4M')).toBeInTheDocument();
      expect(screen.getByText('Outstanding')).toBeInTheDocument();
    });

    it('should handle collapsed state', () => {
      render(
        <TestWrapper>
          <ModuleSidebar moduleId="financial" collapsed={true} />
        </TestWrapper>
      );

      // In collapsed state, should show icons only
      expect(screen.queryByText('Financial Management')).not.toBeInTheDocument();
    });
  });

  describe('ContextualNavigation Component', () => {
    it('should render contextual navigation when available', () => {
      // Mock location to match a path with contextual navigation
      Object.defineProperty(window, 'location', {
        value: { pathname: '/receivables/dashboard' },
        writable: true,
      });

      render(
        <TestWrapper>
          <ContextualNavigation />
        </TestWrapper>
      );

      expect(screen.getByText('Related Actions')).toBeInTheDocument();
    });
  });

  describe('Integration Requirements', () => {
    it('should meet Requirement 2.1: Logical module organization', () => {
      // Financial Management should group related functions
      const financialModule = navigationModules.find(m => m.id === 'financial');
      const itemTitles = financialModule?.children.map(item => item.title) || [];

      expect(itemTitles.some(title => title.includes('Receivables'))).toBe(true);
      expect(itemTitles.some(title => title.includes('Invoice'))).toBe(true);
      expect(itemTitles.some(title => title.includes('Payment'))).toBe(true);
      expect(itemTitles.some(title => title.includes('Account'))).toBe(true);
    });

    it('should meet Requirement 2.2: Consistent navigation with breadcrumbs', () => {
      const breadcrumbs = navigationService.generateBreadcrumbs('/receivables/dashboard');
      expect(breadcrumbs.length).toBeGreaterThan(1);
      expect(breadcrumbs[0].label).toBe('Dashboard');
    });

    it('should meet Requirement 3.1: Unified financial management interface', () => {
      const financialModule = navigationModules.find(m => m.id === 'financial');
      const itemPaths = financialModule?.children.map(item => item.path) || [];

      // Should connect accounts, receivables, and invoicing
      expect(itemPaths.some(path => path.includes('accounts'))).toBe(true);
      expect(itemPaths.some(path => path.includes('receivables'))).toBe(true);
      expect(itemPaths.some(path => path.includes('invoices'))).toBe(true);
    });

    it('should meet Requirement 4.1: Procurement and inventory integration', () => {
      const operationsModule = navigationModules.find(m => m.id === 'operations');
      const itemPaths = operationsModule?.children.map(item => item.path) || [];

      // Should connect procurement and inventory functions
      expect(itemPaths.some(path => path.includes('procurement'))).toBe(true);
      expect(itemPaths.some(path => path.includes('inventory'))).toBe(true);
      expect(itemPaths.some(path => path.includes('requisitions'))).toBe(true);
      expect(itemPaths.some(path => path.includes('suppliers'))).toBe(true);
    });
  });
});
