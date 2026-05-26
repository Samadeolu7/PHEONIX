// Export all auth components
export { ProtectedRoute, withRoleProtection, useRouteAccess } from './ProtectedRoute';
export {
  PermissionGate,
  RoleGate,
  PageGate,
  CategoryGate,
  AdminGate,
  DirectorGate,
  FinancialGate,
  AcademicGate,
} from './PermissionGate';
