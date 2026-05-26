// src/utils/roleBasedRedirect.ts
import { User } from '../services/authService';

/**
 * Determines the redirect path for a user after login based on their role and dashboard assignment
 * @param user - The authenticated user object
 * @returns The path to redirect to
 */
export function getRedirectPathForUser(user: User): string {
  // 1. Assigned dashboard always wins — applies to every user including admins.
  if (user.assigned_dashboard_slug) {
    return `/dashboard/${user.assigned_dashboard_slug}`;
  }
  if (user.assigned_dashboard_id) {
    return `/dashboard/${user.assigned_dashboard_id}`;
  }

  // 2. Role-default dashboard — covers all staff assigned to that role.
  if (user.role_dashboard_slug) {
    return `/dashboard/${user.role_dashboard_slug}`;
  }
  if (user.role_dashboard_id) {
    return `/dashboard/${user.role_dashboard_id}`;
  }

  // 3. No assigned dashboard: only true system admins go to the root homepage.
  if (user.is_system_admin) {
    return '/';
  }

  // 4. Everyone else (owners, staff, regular users) goes to the role-based dashboard.
  return '/dashboard/role-based';
}

/**
 * Checks if a user should have access to the homepage
 * @param user - The authenticated user object
 * @returns true if user can access homepage
 */
export function canAccessHomepage(user: User | null): boolean {
  if (!user) return false;
  console.log('Checking homepage access for user:', user);
  console.log('User roles:', user.is_owner, user.is_staff, user.is_system_admin);
  return user.is_owner || user.is_staff || user.is_system_admin;
}

/**
 * Checks if a user should have access to admin features
 * @param user - The authenticated user object
 * @returns true if user has admin access
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.is_owner || user.is_staff || user.is_system_admin;
}
