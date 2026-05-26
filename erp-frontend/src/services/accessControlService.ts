// Role-based access control service
import { RoleModuleAccess, SearchModuleAccess } from '../types/auth';

class AccessControlService {
  // Define which roles can access which modules
  private roleModuleAccess: RoleModuleAccess = {
    // Finance roles
    'finance-manager': [
      'invoices',
      'receivables',
      'payments',
      'financial-reports',
      'clients',
      'suppliers',
    ],
    'finance-clerk': ['invoices', 'receivables', 'payments', 'clients'],
    accountant: [
      'invoices',
      'receivables',
      'payments',
      'financial-reports',
      'clients',
      'suppliers',
    ],

    // HR roles
    'hr-manager': ['staff', 'payroll', 'attendance', 'leave', 'hr-reports'],
    'hr-clerk': ['staff', 'attendance', 'leave'],
    'payroll-officer': ['staff', 'payroll', 'attendance'],

    // Inventory roles
    'inventory-manager': ['inventory', 'items', 'stock-movements', 'locations', 'suppliers'],
    'inventory-clerk': ['inventory', 'items', 'stock-movements'],
    'warehouse-staff': ['inventory', 'items', 'stock-movements'],

    // Procurement roles
    'procurement-manager': [
      'procurement',
      'purchase-orders',
      'requisitions',
      'suppliers',
      'inventory',
    ],
    'procurement-officer': ['procurement', 'purchase-orders', 'requisitions', 'suppliers'],
    'purchase-clerk': ['requisitions', 'suppliers'],

    // Academic/Student roles (for schools)
    'academic-officer': ['students', 'entitlements', 'fee-structures', 'invoices'],
    registrar: ['students', 'entitlements'],
    'student-affairs': ['students'],

    // Management roles
    admin: ['*'], // Access to everything
    'branch-manager': [
      'invoices',
      'receivables',
      'staff',
      'inventory',
      'procurement',
      'students',
      'reports',
    ],
    'system-admin': ['*'], // Access to everything
  };

  // Define which roles can search which content types
  private searchModuleAccess: SearchModuleAccess = {
    invoice: [
      'finance-manager',
      'finance-clerk',
      'accountant',
      'academic-officer',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    student: [
      'academic-officer',
      'registrar',
      'student-affairs',
      'finance-manager',
      'finance-clerk',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    supplier: [
      'procurement-manager',
      'procurement-officer',
      'purchase-clerk',
      'inventory-manager',
      'finance-manager',
      'accountant',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    item: [
      'inventory-manager',
      'inventory-clerk',
      'warehouse-staff',
      'procurement-manager',
      'procurement-officer',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    staff: ['hr-manager', 'hr-clerk', 'payroll-officer', 'branch-manager', 'admin', 'system-admin'],
    receivable: [
      'finance-manager',
      'finance-clerk',
      'accountant',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    'purchase-order': [
      'procurement-manager',
      'procurement-officer',
      'purchase-clerk',
      'inventory-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],
  };

  // Page-level access control
  private pageAccess: { [key: string]: string[] } = {
    // Finance pages
    '/invoices': [
      'finance-manager',
      'finance-clerk',
      'accountant',
      'academic-officer',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/receivables': [
      'finance-manager',
      'finance-clerk',
      'accountant',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/financial-reports': [
      'finance-manager',
      'accountant',
      'branch-manager',
      'admin',
      'system-admin',
    ],

    // HR pages
    '/hr': ['hr-manager', 'hr-clerk', 'payroll-officer', 'branch-manager', 'admin', 'system-admin'],
    '/hr/staff': [
      'hr-manager',
      'hr-clerk',
      'payroll-officer',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/hr/payroll': ['hr-manager', 'payroll-officer', 'branch-manager', 'admin', 'system-admin'],
    '/hr/attendance': [
      'hr-manager',
      'hr-clerk',
      'payroll-officer',
      'branch-manager',
      'admin',
      'system-admin',
    ],

    // Inventory pages
    '/inventory': [
      'inventory-manager',
      'inventory-clerk',
      'warehouse-staff',
      'procurement-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/inventory/items': [
      'inventory-manager',
      'inventory-clerk',
      'warehouse-staff',
      'procurement-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],

    // Procurement pages
    '/procurement': [
      'procurement-manager',
      'procurement-officer',
      'purchase-clerk',
      'inventory-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/procurement/purchase-orders': [
      'procurement-manager',
      'procurement-officer',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/procurement/requisitions': [
      'procurement-manager',
      'procurement-officer',
      'purchase-clerk',
      'inventory-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],

    // Student/Academic pages
    '/students': [
      'academic-officer',
      'registrar',
      'student-affairs',
      'finance-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/entitlements': [
      'academic-officer',
      'registrar',
      'finance-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],
    '/fee-structures': [
      'academic-officer',
      'finance-manager',
      'branch-manager',
      'admin',
      'system-admin',
    ],

    // Admin pages
    '/admin': ['admin', 'system-admin'],
    '/admin/users': ['admin', 'system-admin'],
    '/admin/branches': ['admin', 'system-admin', 'branch-manager'],
  };

  /**
   * Check if user has access to a specific module
   */
  canAccessModule(moduleId: string, userRoles: string[]): boolean {
    // System admin and admin have access to everything
    if (userRoles.includes('admin') || userRoles.includes('system-admin')) {
      return true;
    }

    // Check if any of the user's roles have access to this module
    return userRoles.some(role => {
      const moduleAccess = this.roleModuleAccess[role as keyof RoleModuleAccess];
      return moduleAccess && (moduleAccess.includes('*') || moduleAccess.includes(moduleId));
    });
  }

  /**
   * Check if user has access to a specific page
   */
  canAccessPage(pagePath: string, userRoles: string[]): boolean {
    // System admin and admin have access to everything
    if (userRoles.includes('admin') || userRoles.includes('system-admin')) {
      return true;
    }

    // Find the most specific matching path
    const matchingPaths = Object.keys(this.pageAccess)
      .filter(path => pagePath.startsWith(path))
      .sort((a, b) => b.length - a.length); // Sort by length descending for most specific match

    if (matchingPaths.length === 0) {
      // If no specific access control is defined, allow access
      return true;
    }

    const mostSpecificPath = matchingPaths[0];
    const allowedRoles = this.pageAccess[mostSpecificPath];

    return userRoles.some(role => allowedRoles.includes(role));
  }

  /**
   * Get accessible search types for user
   */
  getAccessibleSearchTypes(userRoles: string[]): string[] {
    // System admin and admin have access to everything
    if (userRoles.includes('admin') || userRoles.includes('system-admin')) {
      return Object.keys(this.searchModuleAccess);
    }

    const accessibleTypes: string[] = [];

    Object.entries(this.searchModuleAccess).forEach(([searchType, allowedRoles]) => {
      if (userRoles.some(role => allowedRoles.includes(role))) {
        accessibleTypes.push(searchType);
      }
    });

    return accessibleTypes;
  }

  /**
   * Get accessible modules for user
   */
  getAccessibleModules(userRoles: string[]): string[] {
    // System admin and admin have access to everything
    if (userRoles.includes('admin') || userRoles.includes('system-admin')) {
      return ['*'];
    }

    const accessibleModules = new Set<string>();

    userRoles.forEach(role => {
      const moduleAccess = this.roleModuleAccess[role as keyof RoleModuleAccess];
      if (moduleAccess) {
        moduleAccess.forEach(module => accessibleModules.add(module));
      }
    });

    return Array.from(accessibleModules);
  }

  /**
   * Filter navigation items based on user roles
   */
  filterNavigationItems<T extends { path: string; permissions?: string[] }>(
    items: T[],
    userRoles: string[]
  ): T[] {
    return items.filter(item => {
      // If item has specific permissions defined, check those
      if (item.permissions && item.permissions.length > 0) {
        return item.permissions.some(permission => userRoles.includes(permission));
      }

      // Otherwise, check page-level access
      return this.canAccessPage(item.path, userRoles);
    });
  }

  /**
   * Get user-friendly role descriptions
   */
  getRoleDescriptions(): { [key: string]: string } {
    return {
      'finance-manager': 'Finance Manager - Full access to financial modules',
      'finance-clerk': 'Finance Clerk - Basic financial operations',
      accountant: 'Accountant - Financial reporting and analysis',
      'hr-manager': 'HR Manager - Full HR and payroll access',
      'hr-clerk': 'HR Clerk - Basic HR operations',
      'payroll-officer': 'Payroll Officer - Payroll processing',
      'inventory-manager': 'Inventory Manager - Full inventory control',
      'inventory-clerk': 'Inventory Clerk - Basic inventory operations',
      'warehouse-staff': 'Warehouse Staff - Stock movements and handling',
      'procurement-manager': 'Procurement Manager - Full procurement access',
      'procurement-officer': 'Procurement Officer - Purchase orders and suppliers',
      'purchase-clerk': 'Purchase Clerk - Requisitions and basic procurement',
      'academic-officer': 'Academic Officer - Student and fee management',
      registrar: 'Registrar - Student records and enrollment',
      'student-affairs': 'Student Affairs - Student support and services',
      admin: 'Administrator - Full system access',
      'branch-manager': 'Branch Manager - Multi-module branch oversight',
      'system-admin': 'System Administrator - Technical administration',
    };
  }

  /**
   * Check if user can perform specific action on a resource
   */
  canPerformAction(
    action: 'view' | 'create' | 'edit' | 'delete',
    resource: string,
    userRoles: string[]
  ): boolean {
    // System admin and admin can do everything
    if (userRoles.includes('admin') || userRoles.includes('system-admin')) {
      return true;
    }

    // Define action-specific permissions
    const actionPermissions: { [key: string]: { [key: string]: string[] } } = {
      view: {
        invoices: [
          'finance-manager',
          'finance-clerk',
          'accountant',
          'academic-officer',
          'branch-manager',
        ],
        staff: ['hr-manager', 'hr-clerk', 'payroll-officer', 'branch-manager'],
        inventory: [
          'inventory-manager',
          'inventory-clerk',
          'warehouse-staff',
          'procurement-manager',
          'branch-manager',
        ],
      },
      create: {
        invoices: ['finance-manager', 'finance-clerk', 'academic-officer', 'branch-manager'],
        staff: ['hr-manager', 'hr-clerk', 'branch-manager'],
        inventory: ['inventory-manager', 'inventory-clerk', 'branch-manager'],
      },
      edit: {
        invoices: ['finance-manager', 'finance-clerk', 'branch-manager'],
        staff: ['hr-manager', 'branch-manager'],
        inventory: ['inventory-manager', 'branch-manager'],
      },
      delete: {
        invoices: ['finance-manager', 'branch-manager'],
        staff: ['hr-manager', 'branch-manager'],
        inventory: ['inventory-manager', 'branch-manager'],
      },
    };

    const allowedRoles = actionPermissions[action]?.[resource] || [];
    return userRoles.some(role => allowedRoles.includes(role));
  }
}

export const accessControlService = new AccessControlService();
