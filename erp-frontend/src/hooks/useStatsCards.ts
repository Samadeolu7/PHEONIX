// Hook for managing stats cards with real-time updates and caching
import { useState, useEffect, useCallback, useRef } from 'react';
import { StatsCardData } from '../components/dashboard/StatsCard';
import { statsCalculationEngine } from '../services/statsCalculationEngine';
import { statsAggregationService } from '../services/statsAggregationService';
import { statsExportService, ExportOptions, StatsReport } from '../services/statsExportService';
import { statsPerformanceMonitor } from '../services/statsPerformanceMonitor';
import { statsRealTimeService, StatsUpdate } from '../services/statsRealTimeService';
import { dashboardCacheService } from '../services/dashboardCacheService';
import { progressiveLoadingService } from '../services/progressiveLoadingService';
import { UserRole } from '../types/roles';
import { PageId } from '../types/permissions';

export interface UseStatsCardsOptions {
  role: UserRole;
  modules: string[];
  permissions: PageId[];
  enableRealTime?: boolean;
  refreshInterval?: number;
  enableAggregation?: boolean;
  maxRetries?: number;
  cacheTimeout?: number;
}

export interface UseStatsCardsReturn {
  // Data
  stats: StatsCardData[];
  aggregatedStats: StatsCardData[];
  allStats: StatsCardData[];

  // State
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;

  // Actions
  refresh: () => Promise<void>;
  refreshStat: (statId: string) => Promise<void>;
  toggleRealTime: (enabled: boolean) => void;
  clearError: () => void;

  // Configuration
  updateConfig: (config: Partial<UseStatsCardsOptions>) => void;

  // Cache management
  clearCache: () => void;
  getCacheInfo: () => { size: number; keys: string[] };

  // Export and reporting
  exportStats: (options?: Partial<ExportOptions>) => Promise<Blob>;
  generateReport: (options?: Partial<ExportOptions>) => Promise<StatsReport>;
  getReportHistory: (limit?: number) => StatsReport[];

  // Performance monitoring
  getPerformanceMetrics: () => any;
  getPerformanceAlerts: () => any[];

  // Real-time connection
  getRealTimeStatus: () => any;
  getRealTimeStatistics: () => any;
}

export const useStatsCards = (options: UseStatsCardsOptions): UseStatsCardsReturn => {
  const {
    role,
    modules,
    permissions,
    enableRealTime = true,
    refreshInterval = 30000,
    enableAggregation = true,
    maxRetries = 3,
    cacheTimeout = 300000,
  } = options;

  // State
  const [stats, setStats] = useState<StatsCardData[]>([]);
  const [aggregatedStats, setAggregatedStats] = useState<StatsCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [config, setConfig] = useState(options);

  // Refs for cleanup and real-time management
  const realTimeEnabled = useRef(enableRealTime);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  const retryCount = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const realTimeSubscriptionId = useRef<string | null>(null);
  const performanceStartTime = useRef<number>(0);

  // Memoized all stats
  const allStats = [...aggregatedStats, ...stats];

  // Load stats data
  const loadStats = useCallback(
    async (isRefresh = false) => {
      // Record performance start time
      performanceStartTime.current = Date.now();

      // Cancel any ongoing requests
      if (abortController.current) {
        abortController.current.abort();
      }
      abortController.current = new AbortController();

      if (!isRefresh) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError(null);

      try {
        // Load individual module stats
        const individualStatsPromise = statsCalculationEngine.calculateStatsForRole(
          config.role,
          config.modules,
          config.permissions
        );

        // Load aggregated stats if enabled
        const aggregatedStatsPromise = config.enableAggregation
          ? statsAggregationService.aggregateStatsForRole(
              config.role,
              config.modules,
              config.permissions
            )
          : Promise.resolve([]);

        const [individualStats, aggregatedStatsResult] = await Promise.all([
          individualStatsPromise,
          aggregatedStatsPromise,
        ]);

        // Check if request was aborted
        if (abortController.current?.signal.aborted) {
          return;
        }

        setStats(individualStats);
        setAggregatedStats(aggregatedStatsResult);
        setLastUpdated(new Date());
        retryCount.current = 0;

        // Record performance metrics
        const loadTime = Date.now() - performanceStartTime.current;
        const totalStats = individualStats.length + aggregatedStatsResult.length;

        statsPerformanceMonitor.recordStatsLoad(
          config.role,
          config.modules,
          totalStats,
          loadTime,
          true
        );

        // Setup real-time subscription if enabled
        if (realTimeEnabled.current) {
          const allStatsIds = [...individualStats, ...aggregatedStatsResult].map(stat => stat.id);

          // Unsubscribe from previous subscription
          if (realTimeSubscriptionId.current) {
            statsRealTimeService.unsubscribe(realTimeSubscriptionId.current);
          }

          // Create new subscription
          realTimeSubscriptionId.current = statsRealTimeService.subscribe(
            config.role,
            config.modules,
            config.permissions,
            allStatsIds,
            handleRealTimeUpdates
          );

          // Also enable engine-level real-time updates for backward compatibility
          statsCalculationEngine.enableRealTimeUpdates(allStatsIds, handleRealTimeUpdate);
        }
      } catch (err) {
        if (abortController.current?.signal.aborted) {
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to load stats';

        // Record performance metrics for failed request
        const loadTime = Date.now() - performanceStartTime.current;
        statsPerformanceMonitor.recordStatsLoad(
          config.role,
          config.modules,
          0,
          loadTime,
          false,
          errorMessage
        );

        // Retry logic
        if (retryCount.current < config.maxRetries) {
          retryCount.current++;
          console.warn(
            `Stats loading failed, retrying (${retryCount.current}/${config.maxRetries}):`,
            errorMessage
          );

          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount.current - 1), 10000);
          setTimeout(() => loadStats(isRefresh), delay);
          return;
        }

        setError(errorMessage);
        console.error('Failed to load stats after retries:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [config]
  );

  // Refresh individual stat
  const refreshStat = useCallback(async (statId: string) => {
    try {
      const refreshedStats = await statsCalculationEngine.refreshStats([statId]);
      if (refreshedStats.length > 0) {
        handleRealTimeUpdate(refreshedStats);
      }
    } catch (err) {
      console.error('Failed to refresh stat:', statId, err);
      setError(`Failed to refresh ${statId}`);
    }
  }, []);

  // Handle real-time updates from WebSocket service
  const handleRealTimeUpdates = useCallback(
    (updates: StatsUpdate[]) => {
      updates.forEach(update => {
        switch (update.type) {
          case 'stats_update':
            const singleStat = update.data as StatsCardData;
            handleRealTimeUpdate([singleStat]);
            break;
          case 'stats_batch_update':
            const batchStats = update.data as StatsCardData[];
            handleRealTimeUpdate(batchStats);
            break;
          case 'stats_invalidate':
            const invalidateData = update.data as { statsIds: string[] };
            // Refresh invalidated stats
            invalidateData.statsIds.forEach(statId => {
              refreshStat(statId);
            });
            break;
        }
      });
    },
    [refreshStat]
  );

  // Handle real-time updates
  const handleRealTimeUpdate = useCallback((updatedStats: StatsCardData[]) => {
    setStats(prevStats => {
      const newStats = [...prevStats];
      updatedStats.forEach(updatedStat => {
        const index = newStats.findIndex(stat => stat.id === updatedStat.id);
        if (index >= 0) {
          newStats[index] = { ...updatedStat, lastUpdated: new Date() };
        }
      });
      return newStats;
    });

    setAggregatedStats(prevAggregated => {
      const newAggregated = [...prevAggregated];
      updatedStats.forEach(updatedStat => {
        const index = newAggregated.findIndex(stat => stat.id === updatedStat.id);
        if (index >= 0) {
          newAggregated[index] = { ...updatedStat, lastUpdated: new Date() };
        }
      });
      return newAggregated;
    });

    setLastUpdated(new Date());
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    await loadStats(true);
  }, [isRefreshing, loadStats]);

  // Toggle real-time updates
  const toggleRealTime = useCallback(
    (enabled: boolean) => {
      realTimeEnabled.current = enabled;

      if (enabled) {
        const allStatsIds = allStats.map(stat => stat.id);
        statsCalculationEngine.enableRealTimeUpdates(allStatsIds, handleRealTimeUpdate);
      } else {
        statsCalculationEngine.disableRealTimeUpdates();
      }
    },
    [allStats, handleRealTimeUpdate]
  );

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
    retryCount.current = 0;
  }, []);

  // Update configuration
  const updateConfig = useCallback((newConfig: Partial<UseStatsCardsOptions>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // Cache management
  const clearCache = useCallback(() => {
    statsAggregationService.clearCache();
  }, []);

  const getCacheInfo = useCallback(() => {
    return statsAggregationService.getCacheStats();
  }, []);

  // Setup periodic refresh
  useEffect(() => {
    if (config.refreshInterval && config.refreshInterval > 0) {
      refreshTimer.current = setInterval(() => {
        if (!isLoading && !isRefreshing && realTimeEnabled.current) {
          loadStats(true);
        }
      }, config.refreshInterval);

      return () => {
        if (refreshTimer.current) {
          clearInterval(refreshTimer.current);
        }
      };
    }
  }, [config.refreshInterval, isLoading, isRefreshing, loadStats]);

  // Load initial data
  useEffect(() => {
    loadStats();

    // Cleanup on unmount
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
      }
      statsCalculationEngine.disableRealTimeUpdates();
    };
  }, [loadStats]);

  // Update config when props change
  useEffect(() => {
    const newConfig = {
      role,
      modules,
      permissions,
      enableRealTime,
      refreshInterval,
      enableAggregation,
      maxRetries,
      cacheTimeout,
    };

    // Check if significant config changed (requires reload)
    const significantChange =
      config.role !== role ||
      JSON.stringify(config.modules) !== JSON.stringify(modules) ||
      JSON.stringify(config.permissions) !== JSON.stringify(permissions) ||
      config.enableAggregation !== enableAggregation;

    setConfig(newConfig);

    if (significantChange) {
      loadStats();
    }
  }, [
    role,
    modules,
    permissions,
    enableRealTime,
    refreshInterval,
    enableAggregation,
    maxRetries,
    cacheTimeout,
  ]);

  // Update real-time setting
  useEffect(() => {
    toggleRealTime(config.enableRealTime || false);
  }, [config.enableRealTime, toggleRealTime]);

  // Export and reporting functions
  const exportStats = useCallback(
    async (options?: Partial<ExportOptions>): Promise<Blob> => {
      const report = await statsExportService.generateReport(
        config.role,
        config.modules,
        config.permissions,
        options
      );
      return statsExportService.exportReport(report, options?.format || 'json');
    },
    [config]
  );

  const generateReport = useCallback(
    async (options?: Partial<ExportOptions>): Promise<StatsReport> => {
      return statsExportService.generateReport(
        config.role,
        config.modules,
        config.permissions,
        options
      );
    },
    [config]
  );

  const getReportHistory = useCallback(
    (limit?: number): StatsReport[] => {
      return statsExportService.getReportHistory(config.role, limit);
    },
    [config.role]
  );

  // Performance monitoring functions
  const getPerformanceMetrics = useCallback(() => {
    return statsPerformanceMonitor.getMetrics();
  }, []);

  const getPerformanceAlerts = useCallback(() => {
    return statsPerformanceMonitor.getAlerts();
  }, []);

  // Real-time connection functions
  const getRealTimeStatus = useCallback(() => {
    return statsRealTimeService.getConnectionStatus();
  }, []);

  const getRealTimeStatistics = useCallback(() => {
    return statsRealTimeService.getStatistics();
  }, []);

  // Cleanup real-time subscription on unmount
  useEffect(() => {
    return () => {
      if (realTimeSubscriptionId.current) {
        statsRealTimeService.unsubscribe(realTimeSubscriptionId.current);
      }
    };
  }, []);

  return {
    // Data
    stats,
    aggregatedStats,
    allStats,

    // State
    isLoading,
    isRefreshing,
    error,
    lastUpdated,

    // Actions
    refresh,
    refreshStat,
    toggleRealTime,
    clearError,

    // Configuration
    updateConfig,

    // Cache management
    clearCache,
    getCacheInfo,

    // Export and reporting
    exportStats,
    generateReport,
    getReportHistory,

    // Performance monitoring
    getPerformanceMetrics,
    getPerformanceAlerts,

    // Real-time connection
    getRealTimeStatus,
    getRealTimeStatistics,
  };
};

export default useStatsCards;
