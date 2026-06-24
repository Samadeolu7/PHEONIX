// Contextual navigation definitions for providing related links and shortcuts
import { NavigationItem } from '../types/navigation';

export interface ContextualLink {
  id: string;
  title: string;
  path: string;
  icon?: React.ComponentType;
  description?: string;
  type: 'related' | 'shortcut' | 'workflow' | 'report';
}

export interface ContextualNavigation {
  pageId: string;
  relatedLinks: ContextualLink[];
  shortcuts: ContextualLink[];
  workflowSteps?: ContextualLink[];
}

// Contextual navigation mappings for different pages
export const contextualNavigationMap: Record<string, ContextualNavigation> = {
  // Financial Management Contextual Navigation
  '/receivables/dashboard': {
    pageId: 'receivables-dashboard',
    relatedLinks: [
      {
        id: 'aging-report',
        title: 'Aging Analysis',
        path: '/receivables/aging-report',
        type: 'report',
        description: 'View detailed aging analysis',
      },
      {
        id: 'collections',
        title: 'Collections Management',
        path: '/receivables/collections',
        type: 'related',
        description: 'Manage overdue accounts',
      },
      {
        id: 'payment-matching',
        title: 'Payment Matching',
        path: '/receivables/payments/matching',
        type: 'related',
        description: 'Match payments to invoices',
      },
    ],
    shortcuts: [
      {
        id: 'record-payment',
        title: 'Record Payment',
        path: '/receivables/payments/record',
        type: 'shortcut',
        description: 'Quick payment entry',
      },
      {
        id: 'create-invoice',
        title: 'Create Invoice',
        path: '/fee/invoices/create',
        type: 'shortcut',
        description: 'Generate new invoice',
      },
    ],
    workflowSteps: [
      {
        id: 'step-1',
        title: 'Review Outstanding',
        path: '/receivables/dashboard',
        type: 'workflow',
        description: 'Check outstanding receivables',
      },
      {
        id: 'step-2',
        title: 'Analyze Aging',
        path: '/receivables/aging-report',
        type: 'workflow',
        description: 'Review aging analysis',
      },
      {
        id: 'step-3',
        title: 'Process Collections',
        path: '/receivables/collections',
        type: 'workflow',
        description: 'Handle overdue accounts',
      },
    ],
  },

  // Client Services Contextual Navigation
  '/incomes/entitlements': {
    pageId: 'entitlements',
    relatedLinks: [
      {
        id: 'fee-structures',
        title: 'Fee Structures',
        path: '/incomes/fee-structures',
        type: 'related',
        description: 'Manage fee structures',
      },
      {
        id: 'student-accounts',
        title: 'Student Accounts',
        path: '/clients',
        type: 'related',
        description: 'View student accounts',
      },
      {
        id: 'discounts-scholarships',
        title: 'Discounts & Scholarships',
        path: '/incomes/discounts',
        type: 'related',
        description: 'Manage discounts and scholarships',
      },
    ],
    shortcuts: [
      {
        id: 'bulk-entitlements',
        title: 'Bulk Setup',
        path: '/incomes/entitlements/bulk',
        type: 'shortcut',
        description: 'Bulk entitlement setup',
      },
      {
        id: 'bulk-invoicing',
        title: 'Generate Invoices',
        path: '/demo/bulk-invoice-wizard',
        type: 'shortcut',
        description: 'Bulk invoice generation',
      },
    ],
    workflowSteps: [
      {
        id: 'step-1',
        title: 'Setup Fee Structure',
        path: '/incomes/fee-structures',
        type: 'workflow',
        description: 'Define fee structures',
      },
      {
        id: 'step-2',
        title: 'Create Entitlements',
        path: '/incomes/entitlements',
        type: 'workflow',
        description: 'Setup student entitlements',
      },
      {
        id: 'step-3',
        title: 'Generate Invoices',
        path: '/demo/bulk-invoice-wizard',
        type: 'workflow',
        description: 'Create invoices from entitlements',
      },
      {
        id: 'step-4',
        title: 'Track Payments',
        path: '/clients/payments',
        type: 'workflow',
        description: 'Monitor payment status',
      },
    ],
  },

  // Procurement Contextual Navigation
  '/procurement/requisitions': {
    pageId: 'requisitions',
    relatedLinks: [
      {
        id: 'inventory-levels',
        title: 'Stock Levels',
        path: '/inventory/stock',
        type: 'related',
        description: 'Check current inventory',
      },
      {
        id: 'suppliers',
        title: 'Suppliers',
        path: '/procurement/suppliers',
        type: 'related',
        description: 'Manage suppliers',
      },
      {
        id: 'purchase-orders',
        title: 'Purchase Orders',
        path: '/procurement/orders',
        type: 'related',
        description: 'View purchase orders',
      },
    ],
    shortcuts: [
      {
        id: 'create-requisition',
        title: 'New Requisition',
        path: '/procurement/requisitions/create',
        type: 'shortcut',
        description: 'Create new requisition',
      },
      {
        id: 'reorder-points',
        title: 'Reorder Items',
        path: '/inventory/reorder',
        type: 'shortcut',
        description: 'Items needing reorder',
      },
    ],
    workflowSteps: [
      {
        id: 'step-1',
        title: 'Create Requisition',
        path: '/procurement/requisitions',
        type: 'workflow',
        description: 'Submit purchase request',
      },
      {
        id: 'step-2',
        title: 'Get Approval',
        path: '/procurement/requisitions/approvals',
        type: 'workflow',
        description: 'Obtain necessary approvals',
      },
      {
        id: 'step-3',
        title: 'Create Purchase Order',
        path: '/procurement/orders',
        type: 'workflow',
        description: 'Convert to purchase order',
      },
      {
        id: 'step-4',
        title: 'Receive Goods',
        path: '/procurement/grn',
        type: 'workflow',
        description: 'Process goods receipt',
      },
      {
        id: 'step-5',
        title: 'Update Inventory',
        path: '/inventory/movements',
        type: 'workflow',
        description: 'Update stock levels',
      },
    ],
  },

  // Inventory Contextual Navigation
  '/inventory': {
    pageId: 'inventory-dashboard',
    relatedLinks: [
      {
        id: 'procurement-dashboard',
        title: 'Procurement',
        path: '/procurement',
        type: 'related',
        description: 'Procurement dashboard',
      },
      {
        id: 'stock-movements',
        title: 'Stock Movements',
        path: '/inventory/movements',
        type: 'related',
        description: 'View stock movements',
      },
      {
        id: 'reorder-points',
        title: 'Reorder Management',
        path: '/inventory/reorder',
        type: 'related',
        description: 'Manage reorder points',
      },
    ],
    shortcuts: [
      {
        id: 'stock-adjustment',
        title: 'Stock Adjustment',
        path: '/inventory/adjustments',
        type: 'shortcut',
        description: 'Adjust stock levels',
      },
      {
        id: 'create-requisition',
        title: 'Create Requisition',
        path: '/procurement/requisitions/create',
        type: 'shortcut',
        description: 'Request new stock',
      },
    ],
  },

  // Administration Contextual Navigation
  '/admin/users': {
    pageId: 'user-management',
    relatedLinks: [
      {
        id: 'user-roles',
        title: 'Role Management',
        path: '/admin/roles',
        type: 'related',
        description: 'Manage user roles',
      },
      {
        id: 'user-permissions',
        title: 'Permission Setup',
        path: '/admin/permission-setup',
        type: 'related',
        description: 'Configure role permissions',
      },
      {
        id: 'audit-logs',
        title: 'Audit Logs',
        path: '/admin/audit',
        type: 'related',
        description: 'View user activity logs',
      },
    ],
    shortcuts: [
      {
        id: 'create-user',
        title: 'Add User',
        path: '/admin/users/create',
        type: 'shortcut',
        description: 'Create new user',
      },
      {
        id: 'bulk-import',
        title: 'Bulk Import',
        path: '/admin/import',
        type: 'shortcut',
        description: 'Import multiple users',
      },
    ],
  },
};

// Helper function to get contextual navigation for a page
export const getContextualNavigation = (path: string): ContextualNavigation | undefined => {
  return contextualNavigationMap[path];
};

// Helper function to get related links for a page
export const getRelatedLinks = (path: string): ContextualLink[] => {
  const contextual = getContextualNavigation(path);
  return contextual?.relatedLinks || [];
};

// Helper function to get shortcuts for a page
export const getShortcuts = (path: string): ContextualLink[] => {
  const contextual = getContextualNavigation(path);
  return contextual?.shortcuts || [];
};

// Helper function to get workflow steps for a page
export const getWorkflowSteps = (path: string): ContextualLink[] => {
  const contextual = getContextualNavigation(path);
  return contextual?.workflowSteps || [];
};

// Helper function to find contextual navigation by partial path match
export const findContextualNavigationByPath = (
  currentPath: string
): ContextualNavigation | undefined => {
  // First try exact match
  const exactMatch = contextualNavigationMap[currentPath];
  if (exactMatch) return exactMatch;

  // Then try partial matches
  const pathKeys = Object.keys(contextualNavigationMap);
  const partialMatch = pathKeys.find(key => currentPath.startsWith(key));

  return partialMatch ? contextualNavigationMap[partialMatch] : undefined;
};
