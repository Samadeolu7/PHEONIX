import { UserRole, RoleSelectionData, UserWithRole } from '../types/roles';
import { User } from './authService';

class RoleService {
  private readonly ROLE_SELECTION_KEY = 'selectedRole';
  private readonly ROLE_TIMESTAMP_KEY = 'roleSelectionTimestamp';

  /**
   * Store the selected role in local storage
   */
  setSelectedRole(role: UserRole): void {
    const roleData: RoleSelectionData = {
      selectedRole: role,
      timestamp: new Date(),
    };

    localStorage.setItem(this.ROLE_SELECTION_KEY, role);
    localStorage.setItem(this.ROLE_TIMESTAMP_KEY, roleData.timestamp.toISOString());

    // Dispatch custom event to notify other components
    window.dispatchEvent(
      new CustomEvent('role:changed', {
        detail: { role, timestamp: roleData.timestamp },
      })
    );
  }

  /**
   * Get the currently selected role
   */
  getSelectedRole(): UserRole | null {
    return localStorage.getItem(this.ROLE_SELECTION_KEY) as UserRole | null;
  }

  /**
   * Get role selection data with timestamp
   */
  getRoleSelectionData(): RoleSelectionData | null {
    const role = this.getSelectedRole();
    const timestampStr = localStorage.getItem(this.ROLE_TIMESTAMP_KEY);

    if (!role || !timestampStr) {
      return null;
    }

    return {
      selectedRole: role,
      timestamp: new Date(timestampStr),
    };
  }

  /**
   * Clear the selected role
   */
  clearSelectedRole(): void {
    localStorage.removeItem(this.ROLE_SELECTION_KEY);
    localStorage.removeItem(this.ROLE_TIMESTAMP_KEY);

    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('role:cleared'));
  }

  /**
   * Combine user data with selected role
   */
  combineUserWithRole(user: User, selectedRole?: UserRole): UserWithRole {
    const currentRole = selectedRole || this.getSelectedRole();

    return {
      ...user,
      selectedRole: currentRole || undefined,
    };
  }

  /**
   * Check if a role selection is still valid (within session)
   */
  isRoleSelectionValid(): boolean {
    const roleData = this.getRoleSelectionData();
    if (!roleData) return false;

    // Consider role selection valid for 24 hours
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const age = Date.now() - roleData.timestamp.getTime();

    return age < maxAge;
  }

  /**
   * Validate if the selected role is one of the allowed roles
   */
  isValidRole(role: string): role is UserRole {
    const validRoles: UserRole[] = [
      'Director',
      'Principal',
      'Administrator',
      'Registrar',
      'Officer',
    ];
    return validRoles.includes(role as UserRole);
  }

  /**
   * Get user context with role for permission checking
   */
  getUserContext(): { user: UserWithRole | null; hasRole: boolean } {
    // This would typically get user from auth service
    // For now, we'll return a basic structure
    const selectedRole = this.getSelectedRole();

    return {
      user: null, // Will be populated by auth context
      hasRole: !!selectedRole,
    };
  }

  /**
   * Switch role (for testing purposes)
   */
  switchRole(newRole: UserRole): void {
    this.setSelectedRole(newRole);
  }
}

export const roleService = new RoleService();
