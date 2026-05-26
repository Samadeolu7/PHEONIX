// Hook for accessing integrated dashboard system with backend data
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '../types/roles';
import { DashboardTemplate, StatsCard } from '../types/dashboardTemplates';
import { dashboardBackendIntegration } from '../services/dashboardBackendIntegration';
import { dashboardCompatibilityLayer } from '../services/dashboardCompatibilityLayer';
import { dashboardMigrationService } from '../services/dashboardMigrationService';
import { dashboardTemplateEngine } from '../services/dashboardTemplateEngine';
import { useAuth } from '../contexts/AuthContext';

export interface DashboardIntegrationState {
  template: DashboardTemplate | null;
  backendData: any | null;
  isLoading: boolean;
  error: string | null;
  isEnhanced: boolean;
  lastUpdated: Date | null;
}

export interface DashboardIntegrationActions {
  refreshDashboard: () => Promise<void>;
  updateTemplate: (updates: Partial<DashboardTemplate>) => Promise<void>;
  migrateDashboard: (dashboardId: string) => Promise<void>;
  clearCache: () => void;
  testIntegration: () => Promise<any>;
}

export interface UseDashboardIntegrationOptions {
  role?: UserRole;
  enableBackendIntegration?: boolean;
  enableCompatibilityLayer?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseDashboardIntegrationReturn {
  state: DashboardIntegrationState;
  actions: DashboardIntegrationActions;
  stats: StatsCard[];
  quickActions: any[];
  isCompatibilityMode: boolean;
  migrationStatus: any;
}

/**
 * Hook for accessing the integrated dashboard system
 */
export const useDashboardIntegration = (
  options: UseDashboardIntegrationOptions = {}
): UseDashboardIntegrationReturn => {
  const {
    role: providedRole,
    enableBackendIntegration = true,
    enableCompatibilityLayer = true,
    autoRefresh = true,
    refreshInterval = 5 * 60 * 1000, // 5 minutes
  } = options;

  const { userWithRole, selectedRole } = useAuth();
  const queryClient = useQueryClient();

  // Determine the role to use
  const effectiveRole = providedRole || selectedRole || 'Officer';

  // State management
  const [state, setState] = useState<DashboardIntegrationState>({
    template: null,
    backendData: null,
    isLoading: false,
    error: null,
    isEnhanced: false,
    lastUpdated: null,
  });

  const [isCompatibilityMode, setIsCompatibilityMode] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(null);

  // ===== QUERIES =====

  /**
   * Main dashboard template query with backend integration
   */
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-integration', effectiveRole, enableBackendIntegration],
    queryFn: async () => {
      if (enableBackendIntegration) {
        return await dashboardBackendIntegration.getRoleBasedDashboard(effectiveRole);
      } else {
        // Fallback to template-only (use static import to avoid mixed dynamic/static import warning)
        return dashboardTemplateEngine.generateTemplateForRole(effectiveRole);
      }
    },
    enabled: !!effectiveRole,
    refetchInterval: autoRefresh ? refreshInterval : false,
    staleTime: 2 * 60 * 1000, // 2 minutes
    onSuccess: data => {
      setState(prev => ({
        ...prev,
        template: data,
        isEnhanced: enableBackendIntegration,
        lastUpdated: new Date(),
        error: null,
      }));
    },
    onError: (error: any) => {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to load dashboard',
        isLoading: false,
      }));
    },
  });

  /**
   * Backend dashboard data query
   */
  const backendDataQuery = useQuery({
    queryKey: ['dashboard-backend-data', effectiveRole],
    queryFn: async () => {
      return await dashboardBackendIntegration.getUserAssignedDashboard();
    },
    enabled: enableBackendIntegration && !!effectiveRole,
    refetchInterval: autoRefresh ? refreshInterval : false,
    onSuccess: data => {
      setState(prev => ({
        ...prev,
        backendData: data,
        lastUpdated: new Date(),
      }));
    },
  });

  /**
   * Migration status query
   */
  const migrationStatusQuery = useQuery({
    queryKey: ['dashboard-migration-status'],
    queryFn: async () => {
      // This would typically call a backend endpoint
      // For now, return mock status
      return {
        hasMigrated: localStorage.getItem('dashboard-migration-completed') === 'true',
        migrationDate: localStorage.getItem('dashboard-migration-date'),
        needsMigration: false,
      };
    },
    refetchInterval: false,
    onSuccess: data => {
      setMigrationStatus(data);
    },
  });

  // ===== MUTATIONS =====

  /**
   * Refresh dashboard mutation
   */
  const refreshMutation = useMutation({
    mutationFn: async () => {
      // Clear cache and refetch
      dashboardBackendIntegration.clearCache();
      await queryClient.invalidateQueries(['dashboard-integration']);
      await queryClient.invalidateQueries(['dashboard-backend-data']);
    },
    onSuccess: () => {
      setState(prev => ({
        ...prev,
        lastUpdated: new Date(),
        error: null,
      }));
    },
    onError: (error: any) => {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to refresh dashboard',
      }));
    },
  });

  /**
   * Update template mutation
   */
  const updateTemplateMutation = useMutation({
    mutationFn: async (updates: Partial<DashboardTemplate>) => {
      // This would typically save to backend
      const currentTemplate = state.template;
      if (!currentTemplate) throw new Error('No template to update');

      const updatedTemplate = { ...currentTemplate, ...updates };

      // Save to localStorage for now
      localStorage.setItem(`dashboard-template-${effectiveRole}`, JSON.stringify(updatedTemplate));

      return updatedTemplate;
    },
    onSuccess: updatedTemplate => {
      setState(prev => ({
        ...prev,
        template: updatedTemplate,
        lastUpdated: new Date(),
      }));

      // Invalidate queries to trigger refresh
      queryClient.invalidateQueries(['dashboard-integration']);
    },
  });

  /**
   * Migration mutation
   */
  const migrationMutation = useMutation({
    mutationFn: async (dashboardId: string) => {
      const result = await dashboardMigrationService.migrateSingleDashboard({
        id: dashboardId,
        name: 'Legacy Dashboard',
        slug: 'legacy-dashboard',
        layout_config: {},
        widgets: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!result.success) {
        throw new Error(result.errors?.join(', ') || 'Migration failed');
      }

      return result;
    },
    onSuccess: () => {
      // Mark migration as completed
      localStorage.setItem('dashboard-migration-completed', 'true');
      localStorage.setItem('dashboard-migration-date', new Date().toISOString());

      // Refresh data
      queryClient.invalidateQueries(['dashboard-migration-status']);
      queryClient.invalidateQueries(['dashboard-integration']);
    },
  });

  // ===== ACTIONS =====

  const actions: DashboardIntegrationActions = {
    refreshDashboard: useCallback(async () => {
      await refreshMutation.mutateAsync();
    }, [refreshMutation]),

    updateTemplate: useCallback(
      async (updates: Partial<DashboardTemplate>) => {
        await updateTemplateMutation.mutateAsync(updates);
      },
      [updateTemplateMutation]
    ),

    migrateDashboard: useCallback(
      async (dashboardId: string) => {
        await migrationMutation.mutateAsync(dashboardId);
      },
      [migrationMutation]
    ),

    clearCache: useCallback(() => {
      dashboardBackendIntegration.clearCache();
      queryClient.invalidateQueries(['dashboard-integration']);
      queryClient.invalidateQueries(['dashboard-backend-data']);
    }, [queryClient]),

    testIntegration: useCallback(async () => {
      const results = {
        backendIntegration: false,
        compatibilityLayer: false,
        templateGeneration: false,
        dataEnhancement: false,
        errors: [] as string[],
      };

      try {
        // Test backend integration
        if (enableBackendIntegration) {
          const template = await dashboardBackendIntegration.getRoleBasedDashboard(effectiveRole);
          results.backendIntegration = !!template;
          results.templateGeneration = !!template;
        }

        // Test compatibility layer
        if (enableCompatibilityLayer) {
          const status = dashboardCompatibilityLayer.getStatus();
          results.compatibilityLayer = status.initialized;
        }

        // Test data enhancement
        const backendData = await dashboardBackendIntegration.getUserAssignedDashboard();
        results.dataEnhancement = !!backendData;
      } catch (error: any) {
        results.errors.push(error.message || 'Test failed');
      }

      return results;
    }, [effectiveRole, enableBackendIntegration, enableCompatibilityLayer]),
  };

  // ===== EFFECTS =====

  /**
   * Initialize compatibility layer
   */
  useEffect(() => {
    if (enableCompatibilityLayer) {
      dashboardCompatibilityLayer.initialize({
        enableRoleBasedEnhancement: enableBackendIntegration,
        preserveLegacyFormat: true,
        fallbackToTemplate: true,
      });
      setIsCompatibilityMode(true);
    }
  }, [enableCompatibilityLayer, enableBackendIntegration]);

  /**
   * Update loading state based on queries
   */
  useEffect(() => {
    const isLoading =
      dashboardQuery.isLoading ||
      backendDataQuery.isLoading ||
      refreshMutation.isLoading ||
      updateTemplateMutation.isLoading ||
      migrationMutation.isLoading;

    setState(prev => ({
      ...prev,
      isLoading,
    }));
  }, [
    dashboardQuery.isLoading,
    backendDataQuery.isLoading,
    refreshMutation.isLoading,
    updateTemplateMutation.isLoading,
    migrationMutation.isLoading,
  ]);

  // ===== DERIVED DATA =====

  const stats = state.template?.statsCards || [];
  const quickActions = state.template?.quickActions || [];

  // ===== RETURN =====

  return {
    state: {
      ...state,
      template: dashboardQuery.data || state.template,
      backendData: backendDataQuery.data || state.backendData,
    },
    actions,
    stats,
    quickActions,
    isCompatibilityMode,
    migrationStatus,
  };
};

/**
 * Hook for dashboard migration operations
 */
export const useDashboardMigration = () => {
  const queryClient = useQueryClient();

  const fullMigrationMutation = useMutation({
    mutationFn: async () => {
      return await dashboardMigrationService.performFullMigration();
    },
    onSuccess: summary => {
      console.log('Dashboard migration completed:', summary);

      // Mark migration as completed
      localStorage.setItem('dashboard-migration-completed', 'true');
      localStorage.setItem('dashboard-migration-date', new Date().toISOString());
      localStorage.setItem('dashboard-migration-summary', JSON.stringify(summary));

      // Refresh all dashboard-related queries
      queryClient.invalidateQueries(['dashboard-integration']);
      queryClient.invalidateQueries(['dashboard-backend-data']);
      queryClient.invalidateQueries(['dashboard-migration-status']);
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (migrationId?: string) => {
      return await dashboardMigrationService.rollbackMigration(migrationId);
    },
    onSuccess: () => {
      // Clear migration flags
      localStorage.removeItem('dashboard-migration-completed');
      localStorage.removeItem('dashboard-migration-date');
      localStorage.removeItem('dashboard-migration-summary');

      // Refresh queries
      queryClient.invalidateQueries(['dashboard-integration']);
      queryClient.invalidateQueries(['dashboard-migration-status']);
    },
  });

  return {
    performFullMigration: fullMigrationMutation.mutateAsync,
    rollbackMigration: rollbackMutation.mutateAsync,
    isLoading: fullMigrationMutation.isLoading || rollbackMutation.isLoading,
    error: fullMigrationMutation.error || rollbackMutation.error,
    migrationLog: dashboardMigrationService.getMigrationLog(),
  };
};

/**
 * Hook for dashboard compatibility layer management
 */
export const useDashboardCompatibility = () => {
  const [config, setConfig] = useState(dashboardCompatibilityLayer.getConfig());

  const updateConfig = useCallback(
    (updates: Partial<typeof config>) => {
      const newConfig = { ...config, ...updates };
      dashboardCompatibilityLayer.updateConfig(newConfig);
      setConfig(newConfig);
    },
    [config]
  );

  const testCompatibility = useCallback(async () => {
    return await dashboardCompatibilityLayer.testCompatibility();
  }, []);

  const getStatus = useCallback(() => {
    return dashboardCompatibilityLayer.getStatus();
  }, []);

  return {
    config,
    updateConfig,
    testCompatibility,
    getStatus,
    resetConfig: () => {
      dashboardCompatibilityLayer.resetConfig();
      setConfig(dashboardCompatibilityLayer.getConfig());
    },
  };
};
