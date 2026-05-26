// Backward compatibility layer for existing dashboard system integration
import { api } from '../api/api';
import { UserRole } from '../types/roles';
import { DashboardTemplate } from '../types/dashboardTemplates';
import { dashboardBackendIntegration } from './dashboardBackendIntegration';
import { dashboardTemplateEngine } from './dashboardTemplateEngine';

export interface LegacyDashboardAPI {
  getDashboard: (id: string) => Promise<any>;
  createDashboard: (data: any) => Promise<any>;
  updateDashboard: (id: string, data: any) => Promise<any>;
  deleteDashboard: (id: string) => Promise<void>;
  getAllDashboards: () => Promise<any[]>;
}

export interface CompatibilityConfig {
  enableRoleBasedEnhancement: boolean;
  preserveLegacyFormat: boolean;
  autoMigrateOnAccess: boolean;
  fallbackToTemplate: boolean;
}

export class DashboardCompatibilityLayer {
  private static instance: DashboardCompatibilityLayer;
  private config: CompatibilityConfig;
  private legacyAPI: LegacyDashboardAPI;
  private interceptorsInstalled = false;

  private constructor() {
    this.config = {
      enableRoleBasedEnhancement: true,
      preserveLegacyFormat: true,
      autoMigrateOnAccess: false,
      fallbackToTemplate: true,
    };

    // Store original API methods
    this.legacyAPI = {
      getDashboard: this.originalGetDashboard.bind(this),
      createDashboard: this.originalCreateDashboard.bind(this),
      updateDashboard: this.originalUpdateDashboard.bind(this),
      deleteDashboard: this.originalDeleteDashboard.bind(this),
      getAllDashboards: this.originalGetAllDashboards.bind(this),
    };
  }

  public static getInstance(): DashboardCompatibilityLayer {
    if (!DashboardCompatibilityLayer.instance) {
      DashboardCompatibilityLayer.instance = new DashboardCompatibilityLayer();
    }
    return DashboardCompatibilityLayer.instance;
  }

  // ===== INITIALIZATION =====

  /**
   * Initialize compatibility layer with configuration
   */
  public initialize(config?: Partial<CompatibilityConfig>): void {
    this.config = { ...this.config, ...config };

    if (!this.interceptorsInstalled) {
      this.installAPIInterceptors();
      this.interceptorsInstalled = true;
    }
  }

  /**
   * Install API interceptors to enhance dashboard responses
   */
  private installAPIInterceptors(): void {
    // Response interceptor to enhance dashboard data
    api.interceptors.response.use(
      async response => {
        // Check if this is a dashboard-related API call
        if (this.isDashboardAPICall(response.config)) {
          try {
            const enhancedResponse = await this.enhanceDashboardResponse(response);
            return enhancedResponse;
          } catch (error) {
            console.warn('Error enhancing dashboard response:', error);
            // Return original response on error
            return response;
          }
        }
        return response;
      },
      error => {
        // Handle dashboard API errors with fallbacks
        if (this.isDashboardAPICall(error.config)) {
          return this.handleDashboardAPIError(error);
        }
        return Promise.reject(error);
      }
    );

    // Request interceptor to modify dashboard requests
    api.interceptors.request.use(
      config => {
        if (this.isDashboardAPICall(config)) {
          return this.enhanceDashboardRequest(config);
        }
        return config;
      },
      error => Promise.reject(error)
    );
  }

  // ===== API ENHANCEMENT =====

  /**
   * Check if API call is dashboard-related
   */
  private isDashboardAPICall(config: any): boolean {
    if (!config?.url) return false;

    const dashboardPaths = ['/dashboards/', '/widgets/', '/dashboard/', '/widget/'];

    return dashboardPaths.some(path => config.url.includes(path));
  }

  /**
   * Enhance dashboard API responses with role-based data
   */
  private async enhanceDashboardResponse(response: any): Promise<any> {
    if (!this.config.enableRoleBasedEnhancement) {
      return response;
    }

    const url = response.config.url;
    const method = response.config.method?.toLowerCase();

    // Enhance GET dashboard responses
    if (method === 'get' && url.includes('/dashboards/')) {
      const enhancedData = await this.enhanceGetDashboardResponse(response.data, url);
      response.data = enhancedData;
    }

    // Enhance GET all dashboards responses
    if (method === 'get' && url === '/dashboards/') {
      const enhancedData = await this.enhanceGetAllDashboardsResponse(response.data);
      response.data = enhancedData;
    }

    return response;
  }

  /**
   * Enhance single dashboard GET response
   */
  private async enhanceGetDashboardResponse(originalData: any, url: string): Promise<any> {
    try {
      const currentRole = this.getCurrentUserRole();
      if (!currentRole) {
        return originalData;
      }

      // Get role-based template
      const roleTemplate = await dashboardBackendIntegration.getRoleBasedDashboard(currentRole);

      // Merge original data with role-based enhancements
      const enhancedData = {
        ...originalData,

        // Add role-based template data
        roleBasedTemplate: roleTemplate,
        enhancedStats: roleTemplate.statsCards,
        roleBasedQuickActions: roleTemplate.quickActions,

        // Preserve original structure for backward compatibility
        original: this.config.preserveLegacyFormat ? originalData : undefined,

        // Add compatibility metadata
        compatibility: {
          enhanced: true,
          role: currentRole,
          templateId: roleTemplate.id,
          enhancedAt: new Date().toISOString(),
          version: '2.0',
        },
      };

      return enhancedData;
    } catch (error) {
      console.error('Error enhancing dashboard response:', error);
      return originalData;
    }
  }

  /**
   * Enhance all dashboards GET response
   */
  private async enhanceGetAllDashboardsResponse(originalData: any): Promise<any> {
    try {
      const currentRole = this.getCurrentUserRole();
      if (!currentRole) {
        return originalData;
      }

      // Extract dashboards array from response
      const dashboards = originalData?.data || originalData?.results || originalData || [];

      if (!Array.isArray(dashboards)) {
        return originalData;
      }

      // Add role-based template as first option
      const roleTemplate = await dashboardBackendIntegration.getRoleBasedDashboard(currentRole);
      const templateDashboard = {
        id: `role-template-${currentRole.toLowerCase()}`,
        name: `${currentRole} Dashboard`,
        slug: `role-${currentRole.toLowerCase()}`,
        description: `Role-based dashboard template for ${currentRole}`,
        is_template: true,
        is_role_based: true,
        role: currentRole,
        template_data: roleTemplate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Enhanced response structure
      const enhancedData = {
        ...originalData,
        data: [templateDashboard, ...dashboards],
        results: [templateDashboard, ...dashboards],

        // Add role-based metadata
        roleBasedOptions: {
          currentRole,
          availableTemplates: [roleTemplate.id],
          recommendedDashboard: templateDashboard.id,
        },

        // Compatibility info
        compatibility: {
          enhanced: true,
          originalCount: dashboards.length,
          enhancedCount: dashboards.length + 1,
          version: '2.0',
        },
      };

      return enhancedData;
    } catch (error) {
      console.error('Error enhancing all dashboards response:', error);
      return originalData;
    }
  }

  /**
   * Enhance dashboard API requests
   */
  private enhanceDashboardRequest(config: any): any {
    // Add role-based context to requests
    const currentRole = this.getCurrentUserRole();
    if (currentRole) {
      config.headers = {
        ...config.headers,
        'X-User-Role': currentRole,
        'X-Dashboard-Version': '2.0',
      };
    }

    return config;
  }

  /**
   * Handle dashboard API errors with fallbacks
   */
  private async handleDashboardAPIError(error: any): Promise<any> {
    if (!this.config.fallbackToTemplate) {
      return Promise.reject(error);
    }

    const currentRole = this.getCurrentUserRole();
    if (!currentRole) {
      return Promise.reject(error);
    }

    // If dashboard not found, provide role-based template as fallback
    if (error.response?.status === 404) {
      try {
        const roleTemplate = await dashboardBackendIntegration.getRoleBasedDashboard(currentRole);

        const fallbackResponse = {
          data: {
            id: `fallback-${currentRole.toLowerCase()}`,
            name: `${currentRole} Dashboard (Fallback)`,
            slug: `fallback-${currentRole.toLowerCase()}`,
            description: `Fallback role-based dashboard for ${currentRole}`,
            is_fallback: true,
            template_data: roleTemplate,
            fallback_reason: 'Original dashboard not found',
            created_at: new Date().toISOString(),
          },
          status: 200,
          statusText: 'OK (Fallback)',
          config: error.config,
          headers: {},
        };

        console.warn(`Dashboard not found, using role-based fallback for ${currentRole}`);
        return fallbackResponse;
      } catch (fallbackError) {
        console.error('Fallback template generation failed:', fallbackError);
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }

  // ===== LEGACY API WRAPPERS =====

  /**
   * Original getDashboard method (preserved for compatibility)
   */
  private async originalGetDashboard(id: string): Promise<any> {
    const response = await api.get(`/dashboards/${id}/`);
    return response.data?.data || response.data;
  }

  /**
   * Original createDashboard method (preserved for compatibility)
   */
  private async originalCreateDashboard(data: any): Promise<any> {
    const response = await api.post('/dashboards/', data);
    return response.data?.data || response.data;
  }

  /**
   * Original updateDashboard method (preserved for compatibility)
   */
  private async originalUpdateDashboard(id: string, data: any): Promise<any> {
    const response = await api.patch(`/dashboards/${id}/`, data);
    return response.data?.data || response.data;
  }

  /**
   * Original deleteDashboard method (preserved for compatibility)
   */
  private async originalDeleteDashboard(id: string): Promise<void> {
    await api.delete(`/dashboards/${id}/`);
  }

  /**
   * Original getAllDashboards method (preserved for compatibility)
   */
  private async originalGetAllDashboards(): Promise<any[]> {
    const response = await api.get('/dashboards/');
    return response.data?.data || response.data?.results || response.data || [];
  }

  // ===== PUBLIC API METHODS =====

  /**
   * Enhanced getDashboard with role-based features
   */
  public async getDashboard(id: string): Promise<any> {
    try {
      // Check if requesting role-based template
      if (id.startsWith('role-template-')) {
        const role = this.extractRoleFromTemplateId(id);
        if (role) {
          const template = await dashboardBackendIntegration.getRoleBasedDashboard(role);
          return {
            id,
            name: `${role} Dashboard`,
            slug: `role-${role.toLowerCase()}`,
            is_template: true,
            template_data: template,
            created_at: new Date().toISOString(),
          };
        }
      }

      // Use original API (will be enhanced by interceptors)
      return await this.legacyAPI.getDashboard(id);
    } catch (error) {
      console.error('Error in enhanced getDashboard:', error);
      throw error;
    }
  }

  /**
   * Enhanced createDashboard with role-based features
   */
  public async createDashboard(data: any): Promise<any> {
    try {
      // Enhance creation data with role-based context
      const currentRole = this.getCurrentUserRole();
      const enhancedData = {
        ...data,
        role_based: true,
        target_role: currentRole,
        created_with_compatibility_layer: true,
        version: '2.0',
      };

      return await this.legacyAPI.createDashboard(enhancedData);
    } catch (error) {
      console.error('Error in enhanced createDashboard:', error);
      throw error;
    }
  }

  /**
   * Enhanced updateDashboard with role-based features
   */
  public async updateDashboard(id: string, data: any): Promise<any> {
    try {
      // Preserve role-based enhancements during updates
      const enhancedData = {
        ...data,
        updated_with_compatibility_layer: true,
        last_enhanced: new Date().toISOString(),
      };

      return await this.legacyAPI.updateDashboard(id, enhancedData);
    } catch (error) {
      console.error('Error in enhanced updateDashboard:', error);
      throw error;
    }
  }

  /**
   * Enhanced getAllDashboards with role-based features
   */
  public async getAllDashboards(): Promise<any[]> {
    try {
      // Use original API (will be enhanced by interceptors)
      return await this.legacyAPI.getAllDashboards();
    } catch (error) {
      console.error('Error in enhanced getAllDashboards:', error);
      throw error;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get current user role from context
   */
  private getCurrentUserRole(): UserRole | null {
    try {
      // Get from localStorage (role selection)
      const selectedRole = localStorage.getItem('selectedRole');
      if (selectedRole && this.isValidUserRole(selectedRole)) {
        return selectedRole as UserRole;
      }

      // Fallback to auth context
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.roles && user.roles.length > 0) {
          const role = this.mapBackendRoleToUserRole(user.roles[0]);
          if (role) return role;
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting current user role:', error);
      return null;
    }
  }

  /**
   * Check if string is valid UserRole
   */
  private isValidUserRole(role: string): boolean {
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
   * Map backend role to UserRole
   */
  private mapBackendRoleToUserRole(backendRole: string): UserRole | null {
    const roleMap: Record<string, UserRole> = {
      director: 'Director',
      principal: 'Principal',
      admin: 'Administrator',
      administrator: 'Administrator',
      registrar: 'Registrar',
      officer: 'Officer',
      staff: 'Officer',
    };

    return roleMap[backendRole.toLowerCase()] || null;
  }

  /**
   * Extract role from template ID
   */
  private extractRoleFromTemplateId(templateId: string): UserRole | null {
    const match = templateId.match(/role-template-(.+)/);
    if (match) {
      const roleStr = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      return this.isValidUserRole(roleStr) ? (roleStr as UserRole) : null;
    }
    return null;
  }

  // ===== CONFIGURATION =====

  /**
   * Update compatibility configuration
   */
  public updateConfig(config: Partial<CompatibilityConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('Compatibility layer configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): CompatibilityConfig {
    return { ...this.config };
  }

  /**
   * Reset to default configuration
   */
  public resetConfig(): void {
    this.config = {
      enableRoleBasedEnhancement: true,
      preserveLegacyFormat: true,
      autoMigrateOnAccess: false,
      fallbackToTemplate: true,
    };
  }

  // ===== DEBUGGING =====

  /**
   * Get compatibility layer status
   */
  public getStatus(): any {
    return {
      initialized: this.interceptorsInstalled,
      config: this.config,
      currentRole: this.getCurrentUserRole(),
      version: '2.0',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Test compatibility layer functionality
   */
  public async testCompatibility(): Promise<any> {
    const results = {
      interceptorsInstalled: this.interceptorsInstalled,
      roleDetection: !!this.getCurrentUserRole(),
      templateGeneration: false,
      apiEnhancement: false,
      errors: [] as string[],
    };

    try {
      // Test template generation
      const currentRole = this.getCurrentUserRole();
      if (currentRole) {
        await dashboardBackendIntegration.getRoleBasedDashboard(currentRole);
        results.templateGeneration = true;
      }

      // Test API enhancement
      const testResponse = await this.getDashboard('test');
      results.apiEnhancement = !!testResponse;
    } catch (error) {
      results.errors.push(`Test error: ${error}`);
    }

    return results;
  }
}

// Export singleton instance
export const dashboardCompatibilityLayer = DashboardCompatibilityLayer.getInstance();
