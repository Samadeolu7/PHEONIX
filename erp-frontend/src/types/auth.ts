// Enhanced authentication and role-based access control types
export interface UserRole {
  id: string;
  name: string;
  code: string;
  permissions: string[];
  modules: string[];
  description?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: UserRole[];
  permissions: string[];
  is_active: boolean;
  branch_id?: string;
  department?: string;
}

// Module permissions mapping
export interface ModulePermissions {
  [key: string]: {
    view: string[];
    create: string[];
    edit: string[];
    delete: string[];
    admin: string[];
  };
}

// Role-based module access
export interface RoleModuleAccess {
  // Finance roles
  'finance-manager': string[];
  'finance-clerk': string[];
  accountant: string[];

  // HR roles
  'hr-manager': string[];
  'hr-clerk': string[];
  'payroll-officer': string[];

  // Inventory roles
  'inventory-manager': string[];
  'inventory-clerk': string[];
  'warehouse-staff': string[];

  // Procurement roles
  'procurement-manager': string[];
  'procurement-officer': string[];
  'purchase-clerk': string[];

  // Academic/Student roles (for schools)
  'academic-officer': string[];
  registrar: string[];
  'student-affairs': string[];

  // Management roles
  admin: string[];
  'branch-manager': string[];
  'system-admin': string[];
}

// Search module access control
export interface SearchModuleAccess {
  invoice: string[];
  student: string[];
  supplier: string[];
  item: string[];
  staff: string[];
  receivable: string[];
  'purchase-order': string[];
}

// Navigation access control
export interface NavigationAccess {
  canViewModule: (moduleId: string, userRoles: string[]) => boolean;
  canViewPage: (pageId: string, userRoles: string[]) => boolean;
  getAccessibleModules: (userRoles: string[]) => string[];
  getAccessibleSearchTypes: (userRoles: string[]) => string[];
}
