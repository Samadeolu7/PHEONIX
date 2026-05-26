// Stats card container with layout management and theming
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StatsCard, StatsCardData } from './StatsCard';
import { statsCalculationEngine } from '../../services/statsCalculationEngine';
import { statsAggregationService } from '../../services/statsAggregationService';
import { UserRole } from '../../types/roles';
import { PageId } from '../../types/permissions';
import { cn } from '../../lib/utils';
import { RefreshCw, Settings, Grid, List, BarChart3, TrendingUp } from 'lucide-react';

export interface StatsCardContainerProps {
  role: UserRole;
  modules: string[];
  permissions: PageId[];
  layout?: 'grid' | 'list' | 'masonry' | 'carousel';
  size?: 'small' | 'medium' | 'large';
  theme?: 'light' | 'dark' | 'gradient' | 'mixed';
  showAggregated?: boolean;
  showControls?: boolean;
  enableRealTime?: boolean;
  refreshInterval?: number;
  maxCards?: number;
  className?: string;
  onStatsUpdate?: (stats: StatsCardData[]) => void;
  onError?: (error: string) => void;
}

export interface StatsContainerState {
  stats: StatsCardData[];
  aggregatedStats: StatsCardData[];
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  visibleStats: Set<string>;
}

const layoutClasses = {
  grid: {
    container: 'grid gap-4',
    responsive: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  },
  list: {
    container: 'flex flex-col gap-4',
    responsive: '',
  },
  masonry: {
    container: 'columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4',
    responsive: '',
  },
  carousel: {
    container: 'flex gap-4 overflow-x-auto pb-4',
    responsive: 'snap-x snap-mandatory',
  },
};

const themeConfigs = {
  light: {
    container: 'bg-gray-50',
    card: 'light',
  },
  dark: {
    container: 'bg-gray-900',
    card: 'dark',
  },
  gradient: {
    container: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    card: 'gradient',
  },
  mixed: {
    container: 'bg-white',
    card: 'mixed', // Will cycle through different themes
  },
};

export const StatsCardContainer: React.FC<StatsCardContainerProps> = ({
  role,
  modules,
  permissions,
  layout = 'grid',
  size = 'medium',
  theme = 'light',
  showAggregated = true,
  showControls = false,
  enableRealTime = true,
  refreshInterval = 30,
  maxCards = 8,
  className = '',
  onStatsUpdate,
  onError,
}) => {
  const [state, setState] = useState<StatsContainerState>({
    stats: [],
    aggregatedStats: [],
    isLoading: true,
    error: null,
    lastRefresh: null,
    visibleStats: new Set(),
  });

  const [viewMode, setViewMode] = useState<'individual' | 'aggregated' | 'mixed'>('mixed');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Memoized theme configuration
  const themeConfig = useMemo(() => themeConfigs[theme], [theme]);
  const layoutConfig = useMemo(() => layoutClasses[layout], [layout]);

  // Load initial stats
  const loadStats = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Load individual module stats
      const individualStats = await statsCalculationEngine.calculateStatsForRole(
        role,
        modules,
        permissions
      );

      // Load aggregated stats if enabled
      let aggregatedStats: StatsCardData[] = [];
      if (showAggregated) {
        aggregatedStats = await statsAggregationService.aggregateStatsForRole(
          role,
          modules,
          permissions
        );
      }

      // Initialize visible stats (all visible by default)
      const allStatsIds = [...individualStats, ...aggregatedStats].map(stat => stat.id);
      const visibleStats = new Set(allStatsIds);

      setState(prev => ({
        ...prev,
        stats: individualStats,
        aggregatedStats,
        isLoading: false,
        lastRefresh: new Date(),
        visibleStats,
      }));

      // Notify parent component
      if (onStatsUpdate) {
        onStatsUpdate([...individualStats, ...aggregatedStats]);
      }

      // Enable real-time updates
      if (enableRealTime) {
        statsCalculationEngine.enableRealTimeUpdates(allStatsIds, handleRealTimeUpdate);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load stats';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      if (onError) {
        onError(errorMessage);
      }
    }
  }, [role, modules, permissions, showAggregated, enableRealTime, onStatsUpdate, onError]);

  // Handle real-time updates
  const handleRealTimeUpdate = useCallback(
    (updatedStats: StatsCardData[]) => {
      setState(prev => {
        const newStats = [...prev.stats];
        const newAggregatedStats = [...prev.aggregatedStats];

        updatedStats.forEach(updatedStat => {
          // Update individual stats
          const individualIndex = newStats.findIndex(stat => stat.id === updatedStat.id);
          if (individualIndex >= 0) {
            newStats[individualIndex] = updatedStat;
          }

          // Update aggregated stats
          const aggregatedIndex = newAggregatedStats.findIndex(stat => stat.id === updatedStat.id);
          if (aggregatedIndex >= 0) {
            newAggregatedStats[aggregatedIndex] = updatedStat;
          }
        });

        return {
          ...prev,
          stats: newStats,
          aggregatedStats: newAggregatedStats,
          lastRefresh: new Date(),
        };
      });

      if (onStatsUpdate) {
        onStatsUpdate(updatedStats);
      }
    },
    [onStatsUpdate]
  );

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await loadStats();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadStats]);

  // Refresh individual stat
  const handleStatRefresh = useCallback(
    async (statId: string) => {
      try {
        const refreshedStats = await statsCalculationEngine.refreshStats([statId]);
        if (refreshedStats.length > 0) {
          handleRealTimeUpdate(refreshedStats);
        }
      } catch (error) {
        console.error('Failed to refresh stat:', statId, error);
      }
    },
    [handleRealTimeUpdate]
  );

  // Toggle stat visibility
  const handleVisibilityToggle = useCallback((statId: string, visible: boolean) => {
    setState(prev => {
      const newVisibleStats = new Set(prev.visibleStats);
      if (visible) {
        newVisibleStats.add(statId);
      } else {
        newVisibleStats.delete(statId);
      }
      return {
        ...prev,
        visibleStats: newVisibleStats,
      };
    });
  }, []);

  // Get stats to display based on view mode
  const displayStats = useMemo(() => {
    let stats: StatsCardData[] = [];

    switch (viewMode) {
      case 'individual':
        stats = state.stats;
        break;
      case 'aggregated':
        stats = state.aggregatedStats;
        break;
      case 'mixed':
      default:
        // Mix aggregated and individual stats, prioritizing aggregated
        stats = [
          ...state.aggregatedStats,
          ...state.stats.filter(
            stat => !state.aggregatedStats.some(aggStat => aggStat.category === stat.category)
          ),
        ];
        break;
    }

    // Filter by visibility and apply max cards limit
    return stats
      .filter(stat => state.visibleStats.has(stat.id))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, maxCards);
  }, [state.stats, state.aggregatedStats, state.visibleStats, viewMode, maxCards]);

  // Get card theme for mixed theme mode
  const getCardTheme = useCallback(
    (index: number) => {
      if (theme !== 'mixed') return theme;

      const themes: Array<'light' | 'dark' | 'gradient'> = ['light', 'gradient', 'dark'];
      return themes[index % themes.length];
    },
    [theme]
  );

  // Initialize stats on mount
  useEffect(() => {
    loadStats();

    // Cleanup real-time updates on unmount
    return () => {
      if (enableRealTime) {
        statsCalculationEngine.disableRealTimeUpdates();
      }
    };
  }, [loadStats, enableRealTime]);

  // Loading state
  if (state.isLoading) {
    return (
      <div className={cn('rounded-lg p-6', themeConfig.container, className)}>
        <div className={cn(layoutConfig.container, layoutConfig.responsive)}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-10 w-10 bg-gray-200 rounded-lg"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className={cn('rounded-lg p-6 border border-red-200 bg-red-50', className)}>
        <div className="text-center">
          <div className="text-red-600 mb-2">Failed to load stats</div>
          <div className="text-sm text-red-500 mb-4">{state.error}</div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg p-6', themeConfig.container, className)}>
      {/* Controls */}
      {showControls && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold">Dashboard Stats</h3>
            {state.lastRefresh && (
              <span className="text-sm text-gray-500">
                Last updated: {state.lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('individual')}
                className={cn(
                  'px-3 py-1 rounded text-sm transition-colors',
                  viewMode === 'individual' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('aggregated')}
                className={cn(
                  'px-3 py-1 rounded text-sm transition-colors',
                  viewMode === 'aggregated' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                )}
              >
                <BarChart3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('mixed')}
                className={cn(
                  'px-3 py-1 rounded text-sm transition-colors',
                  viewMode === 'mixed' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                )}
              >
                <TrendingUp className="h-4 w-4" />
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Refresh all stats"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </button>

            {/* Settings Button */}
            <button
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Stats settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div
        className={cn(
          layoutConfig.container,
          layout === 'grid' && layoutConfig.responsive,
          layout === 'carousel' && layoutConfig.responsive
        )}
      >
        {displayStats.map((stat, index) => (
          <div
            key={stat.id}
            className={cn(
              layout === 'masonry' && 'break-inside-avoid mb-4',
              layout === 'carousel' && 'flex-shrink-0 w-80 snap-start'
            )}
          >
            <StatsCard
              {...stat}
              size={size}
              theme={getCardTheme(index)}
              showControls={showControls}
              realTimeEnabled={enableRealTime}
              refreshInterval={refreshInterval}
              onRefresh={handleStatRefresh}
              onVisibilityToggle={handleVisibilityToggle}
              isVisible={state.visibleStats.has(stat.id)}
              className={cn(
                layout === 'list' && 'w-full',
                'group hover:shadow-lg transition-shadow duration-200'
              )}
            />
          </div>
        ))}
      </div>

      {/* Empty State */}
      {displayStats.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-2">No stats available</div>
          <div className="text-sm text-gray-400">Check your permissions or try refreshing</div>
        </div>
      )}
    </div>
  );
};

export default StatsCardContainer;
