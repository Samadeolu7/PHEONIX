// Stats card container with layout management and theming
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { StatsCard, StatsCardData } from './StatsCard';
import { statsCalculationEngine } from '../../services/statsCalculationEngine';
import { statsAggregationService } from '../../services/statsAggregationService';
import { UserRole } from '../../types/roles';
import { PageId } from '../../types/permissions';
import { cn } from '../../lib/utils';
import { RefreshCw, Settings, Grid, List, BarChart3, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
    card: 'mixed',
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
  const [viewMode, setViewMode] = useState<'individual' | 'aggregated' | 'mixed'>('mixed');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [visibleStats, setVisibleStats] = useState<Set<string>>(new Set());

  const themeConfig = useMemo(() => themeConfigs[theme], [theme]);
  const layoutConfig = useMemo(() => layoutClasses[layout], [layout]);

  const { data: individualStats = [], isLoading: isLoadingIndividual, error: individualError } = useQuery({
    queryKey: ['stats', 'role', role, modules, permissions],
    queryFn: async () => {
      return statsCalculationEngine.calculateStatsForRole(role, modules, permissions);
    },
  });

  const { data: aggregatedStats = [] } = useQuery({
    queryKey: ['stats', 'aggregated', role, modules, permissions],
    queryFn: async () => {
      return statsAggregationService.aggregateStatsForRole(role, modules, permissions);
    },
    enabled: showAggregated,
  });

  const isLoading = isLoadingIndividual;
  const error = individualError?.message || null;

  // Initialize visible stats when data loads
  useEffect(() => {
    const allStatsIds = [...individualStats, ...aggregatedStats].map(stat => stat.id);
    if (allStatsIds.length > 0 && visibleStats.size === 0) {
      setVisibleStats(new Set(allStatsIds));
    }
  }, [individualStats, aggregatedStats, visibleStats.size]);

  // Notify parent on stats update
  useEffect(() => {
    if (onStatsUpdate && (individualStats.length > 0 || aggregatedStats.length > 0)) {
      onStatsUpdate([...individualStats, ...aggregatedStats]);
    }
  }, [individualStats, aggregatedStats, onStatsUpdate]);

  // Enable real-time updates
  useEffect(() => {
    if (enableRealTime) {
      const allStatsIds = [...individualStats, ...aggregatedStats].map(stat => stat.id);
      if (allStatsIds.length > 0) {
        const handleRealTimeUpdate = (updatedStats: StatsCardData[]) => {
          setVisibleStats(prev => new Set(prev));
          setLastRefresh(new Date());
          if (onStatsUpdate) {
            onStatsUpdate(updatedStats);
          }
        };
        statsCalculationEngine.enableRealTimeUpdates(allStatsIds, handleRealTimeUpdate);
        return () => {
          statsCalculationEngine.disableRealTimeUpdates();
        };
      }
    }
  }, [enableRealTime, individualStats, aggregatedStats, onStatsUpdate]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setLastRefresh(new Date());
    setIsRefreshing(false);
  }, [isRefreshing]);

  const handleStatRefresh = useCallback(
    async (statId: string) => {
      try {
        const refreshedStats = await statsCalculationEngine.refreshStats([statId]);
        if (refreshedStats.length > 0) {
          setLastRefresh(new Date());
        }
      } catch (err) {
        console.error('Failed to refresh stat:', statId, err);
      }
    },
    []
  );

  const handleVisibilityToggle = useCallback((statId: string, visible: boolean) => {
    setVisibleStats(prev => {
      const newSet = new Set(prev);
      if (visible) {
        newSet.add(statId);
      } else {
        newSet.delete(statId);
      }
      return newSet;
    });
  }, []);

  // Notify parent of errors
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const displayStats = useMemo(() => {
    let stats: StatsCardData[] = [];

    switch (viewMode) {
      case 'individual':
        stats = individualStats;
        break;
      case 'aggregated':
        stats = aggregatedStats;
        break;
      case 'mixed':
      default:
        stats = [
          ...aggregatedStats,
          ...individualStats.filter(
            stat => !aggregatedStats.some(aggStat => aggStat.category === stat.category)
          ),
        ];
        break;
    }

    return stats
      .filter(stat => visibleStats.has(stat.id))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, maxCards);
  }, [individualStats, aggregatedStats, visibleStats, viewMode, maxCards]);

  const getCardTheme = useCallback(
    (index: number) => {
      if (theme !== 'mixed') return theme;
      const themes: Array<'light' | 'dark' | 'gradient'> = ['light', 'gradient', 'dark'];
      return themes[index % themes.length];
    },
    [theme]
  );

  if (isLoading) {
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

  if (error) {
    return (
      <div className={cn('rounded-lg p-6 border border-red-200 bg-red-50', className)}>
        <div className="text-center">
          <div className="text-red-600 mb-2">Failed to load stats</div>
          <div className="text-sm text-red-500 mb-4">{error}</div>
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
            {lastRefresh && (
              <span className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
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
              isVisible={visibleStats.has(stat.id)}
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
