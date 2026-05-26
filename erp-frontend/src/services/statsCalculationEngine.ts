// Stats calculation engine with real-time data and permission-based filtering
import { StatsCardData } from '../components/dashboard/StatsCard';
import { UserRole } from '../types/roles';
import { PageId, FunctionalCategory } from '../types/permissions';
import { api } from './api';
import { dashboardCacheService } from './dashboardCacheService';
import { statsPerformanceMonitor } from './statsPerformanceMonitor';
import { progressiveLoadingService } from './progressiveLoadingService';

export interface StatsCalculationConfig {
  refreshInterval: number;
  enableRealTime: boolean;
  cacheTimeout: number;
  maxRetries: number;
}

export interface ModuleStatsConfig {
  moduleId: string;
  permissions: PageId[];
  endpoints: string[];
  calculations: StatsCalculation[];
}

export interface StatsCalculation {
  id: string;
  title: string;
  type: 'count' | 'sum' | 'average' | 'percentage' | 'trend';
  dataSource: string;
  field?: string;
  filters?: Record<string, any>;
  format: 'number' | 'currency' | 'percentage';
  icon: string;
  color: StatsCardData['color'];
  category: FunctionalCategory;
  permissions: PageId[];
  priority: number;
  refreshInterval?: number;
}

export interface StatsCache {
  [key: string]: {
    data: any;
    timestamp: Date;
    expiresAt: Date;
    hitCount: number;
    lastAccessed: Date;
    size: number; // Approximate size in bytes
  };
}

export interface CacheMetrics {
  totalSize: number;
  totalEntries: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export class StatsCalculationEngine {
  private cache: StatsCache = {};
  private config: StatsCalculationConfig;
  private moduleConfigs: Record<string, ModuleStatsConfig>;
  private refreshTimers: Record<string, NodeJS.Timeout> = {};
  private cacheMetrics: {
    hits: number;
    misses: number;
    evictions: number;
    maxSize: number; // Maximum cache size in bytes
  } = {
    hits: 0,
    misses: 0,
    evictions: 0,
    maxSize: 50 * 1024 * 1024, // 50MB default
  };

  constructor(config: Partial<StatsCalculationConfig> = {}) {
    this.config = {
      refreshInterval: 30000, // 30 seconds
      enableRealTime: true,
      cacheTimeout: 300000, // 5 minutes
      maxRetries: 3,
      ...config,
    };

    this.moduleConfigs = this.initializeModuleConfigs();
  }

  // Initialize module-specific stats configurations
  private initializeModuleConfigs(): Record<string, ModuleStatsConfig> {
    return {
      financial: {
        moduleId: 'financial',
        permissions: ['financial.receivables_dashboard', 'financial.accounts_management'],
        endpoints: [
          '/api/receivables/summary/',
          '/api/accounts/balance/',
          '/api/transactions/summary/',
        ],
        calculations: [
          {
            id: 'total-receivables',
            title: 'Total Receivables',
            type: 'sum',
            dataSource: '/api/receivables/summary/',
            field: 'total_amount',
            format: 'currency',
            icon: 'DollarSign',
            color: 'blue',
            category: 'Financial Operations',
            permissions: ['financial.receivables_dashboard'],
            priority: 10,
          },
          {
            id: 'overdue-receivables',
            title: 'Overdue Amount',
            type: 'sum',
            dataSource: '/api/receivables/aging/',
            field: 'overdue_amount',
            filters: { days_overdue__gt: 30 },
            format: 'currency',
            icon: 'AlertTriangle',
            color: 'red',
            category: 'Financial Operations',
            permissions: ['financial.receivables_dashboard'],
            priority: 9,
          },
          {
            id: 'monthly-revenue',
            title: 'Monthly Revenue',
            type: 'sum',
            dataSource: '/api/transactions/revenue/',
            field: 'amount',
            filters: { period: 'current_month' },
            format: 'currency',
            icon: 'TrendingUp',
            color: 'green',
            category: 'Financial Operations',
            permissions: ['financial.accounts_management'],
            priority: 8,
          },
          {
            id: 'collection-rate',
            title: 'Collection Rate',
            type: 'percentage',
            dataSource: '/api/receivables/collection-rate/',
            field: 'rate',
            filters: { period: 'current_month' },
            format: 'percentage',
            icon: 'Target',
            color: 'green',
            category: 'Financial Operations',
            permissions: ['financial.receivables_dashboard'],
            priority: 7,
          },
        ],
      },
      'client-services': {
        moduleId: 'client-services',
        permissions: ['students.client_management', 'students.entitlements'],
        endpoints: ['/api/clients/stats/', '/api/incomes/entitlements/stats/'],
        calculations: [
          {
            id: 'total-students',
            title: 'Total Students',
            type: 'count',
            dataSource: '/api/clients/stats/',
            field: 'total_count',
            format: 'number',
            icon: 'Users',
            color: 'blue',
            category: 'Client Management',
            permissions: ['students.client_management'],
            priority: 6,
          },
          {
            id: 'new-enrollments',
            title: 'New Enrollments',
            type: 'count',
            dataSource: '/api/clients/stats/',
            field: 'new_this_month',
            format: 'number',
            icon: 'UserPlus',
            color: 'green',
            category: 'Client Management',
            permissions: ['students.client_management'],
            priority: 5,
          },
          {
            id: 'entitlement-completion',
            title: 'Entitlement Completion',
            type: 'percentage',
            dataSource: '/api/incomes/entitlements/completion/',
            field: 'completion_rate',
            format: 'percentage',
            icon: 'CheckCircle',
            color: 'green',
            category: 'Client Management',
            permissions: ['students.entitlements'],
            priority: 4,
          },
        ],
      },
      operations: {
        moduleId: 'operations',
        permissions: ['operations.procurement_dashboard', 'operations.inventory_management'],
        endpoints: ['/api/procurement/stats/', '/api/inventory/stats/'],
        calculations: [
          {
            id: 'pending-requisitions',
            title: 'Pending Requisitions',
            type: 'count',
            dataSource: '/api/procurement/requisitions/stats/',
            field: 'pending_count',
            format: 'number',
            icon: 'FileText',
            color: 'yellow',
            category: 'Operations',
            permissions: ['operations.procurement_dashboard'],
            priority: 3,
          },
          {
            id: 'low-stock-items',
            title: 'Low Stock Items',
            type: 'count',
            dataSource: '/api/inventory/low-stock/',
            field: 'count',
            format: 'number',
            icon: 'AlertCircle',
            color: 'red',
            category: 'Operations',
            permissions: ['operations.inventory_management'],
            priority: 2,
          },
        ],
      },
      administration: {
        moduleId: 'administration',
        permissions: ['admin.system_settings', 'users.add'],
        endpoints: ['/api/admin/stats/', '/api/users/stats/'],
        calculations: [
          {
            id: 'active-users',
            title: 'Active Users',
            type: 'count',
            dataSource: '/api/users/stats/',
            field: 'active_count',
            format: 'number',
            icon: 'Users',
            color: 'blue',
            category: 'User Management',
            permissions: ['users.add'],
            priority: 1,
          },
        ],
      },
    };
  }

  // Calculate stats for a specific role and modules
  async calculateStatsForRole(
    role: UserRole,
    modules: string[],
    permissions: PageId[]
  ): Promise<StatsCardData[]> {
    const statsPromises: Promise<StatsCardData[]>[] = [];

    // Calculate stats for each accessible module
    for (const moduleId of modules) {
      if (this.moduleConfigs[moduleId]) {
        statsPromises.push(this.calculateModuleStats(moduleId, permissions));
      }
    }

    // Wait for all module stats to complete
    const moduleStatsArrays = await Promise.allSettled(statsPromises);

    // Flatten and filter successful results
    const allStats: StatsCardData[] = [];
    moduleStatsArrays.forEach(result => {
      if (result.status === 'fulfilled') {
        allStats.push(...result.value);
      }
    });

    // Sort by priority and apply role-specific limits
    const sortedStats = allStats.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Role-specific limits
    const limits: Record<UserRole, number> = {
      Director: 8,
      Principal: 6,
      Administrator: 5,
      Registrar: 4,
      Officer: 4,
    };

    return sortedStats.slice(0, limits[role] || 4);
  }

  // Calculate stats for a specific module
  async calculateModuleStats(
    moduleId: string,
    userPermissions: PageId[]
  ): Promise<StatsCardData[]> {
    const moduleConfig = this.moduleConfigs[moduleId];
    if (!moduleConfig) {
      return [];
    }

    // Filter calculations based on user permissions
    const allowedCalculations = moduleConfig.calculations.filter(calc =>
      calc.permissions.some(permission => userPermissions.includes(permission))
    );

    const statsPromises = allowedCalculations.map(calc => this.executeCalculation(calc));

    const results = await Promise.allSettled(statsPromises);

    return results
      .filter(
        (result): result is PromiseFulfilledResult<StatsCardData> => result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  // Execute a single stats calculation with performance optimization
  private async executeCalculation(calculation: StatsCalculation): Promise<StatsCardData> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(calculation);

    // Check advanced cache first
    const cached = dashboardCacheService.get<any>(cacheKey);
    if (cached) {
      const loadTime = Date.now() - startTime;
      statsPerformanceMonitor.recordStatsLoad(
        'Officer', // Default role, should be passed from context
        [calculation.id],
        1,
        loadTime,
        true
      );
      return this.formatStatsCard(calculation, cached);
    }

    try {
      // Fetch data from API with performance monitoring
      const data = await this.fetchStatsData(calculation);

      // Cache the result using advanced cache service
      dashboardCacheService.set(cacheKey, data, {
        ttl: this.config.cacheTimeout,
        tags: [calculation.category, calculation.id, 'stats'],
        priority: calculation.priority,
      });

      const loadTime = Date.now() - startTime;
      statsPerformanceMonitor.recordStatsLoad('Officer', [calculation.id], 1, loadTime, true);

      return this.formatStatsCard(calculation, data);
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data';

      statsPerformanceMonitor.recordStatsLoad(
        'Officer',
        [calculation.id],
        0,
        loadTime,
        false,
        errorMessage
      );

      console.error(`Failed to calculate stats for ${calculation.id}:`, error);

      // Return error state
      return {
        id: calculation.id,
        title: calculation.title,
        value: 'Error',
        icon: this.getIconComponent(calculation.icon),
        color: 'red',
        category: calculation.category,
        priority: calculation.priority,
        error: errorMessage,
      };
    }
  }

  // Fetch stats data from API
  private async fetchStatsData(calculation: StatsCalculation): Promise<any> {
    const params = calculation.filters || {};

    try {
      const response = await api.get(calculation.dataSource, { params });
      return response.data?.data || response.data;
    } catch (error) {
      // Retry logic
      for (let i = 0; i < this.config.maxRetries; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          const response = await api.get(calculation.dataSource, { params });
          return response.data?.data || response.data;
        } catch (retryError) {
          if (i === this.config.maxRetries - 1) {
            throw retryError;
          }
        }
      }
      throw error;
    }
  }

  // Format raw data into StatsCard format
  private formatStatsCard(calculation: StatsCalculation, data: any): StatsCardData {
    let value: string | number;
    let change: StatsCardData['change'];

    switch (calculation.type) {
      case 'count':
        value = data[calculation.field || 'count'] || 0;
        break;
      case 'sum':
        value = data[calculation.field || 'total'] || 0;
        break;
      case 'average':
        value = data[calculation.field || 'average'] || 0;
        break;
      case 'percentage':
        value = data[calculation.field || 'percentage'] || 0;
        break;
      case 'trend':
        value = data[calculation.field || 'value'] || 0;
        if (data.previous_value !== undefined) {
          const current = Number(value);
          const previous = Number(data.previous_value);
          if (previous > 0) {
            const changeValue = ((current - previous) / previous) * 100;
            change = {
              value: Math.round(changeValue * 10) / 10,
              type: changeValue >= 0 ? 'increase' : 'decrease',
              period: data.period || 'previous period',
            };
          }
        }
        break;
      default:
        value = data[calculation.field || 'value'] || 0;
    }

    return {
      id: calculation.id,
      title: calculation.title,
      value,
      change,
      icon: this.getIconComponent(calculation.icon),
      color: calculation.color,
      category: calculation.category,
      priority: calculation.priority,
      format: calculation.format,
      refreshInterval: calculation.refreshInterval || this.config.refreshInterval / 1000,
      lastUpdated: new Date(),
    };
  }

  // Get icon component by name
  private getIconComponent(iconName: string): string {
    // Return the icon name as string - will be resolved by StatsCard component
    return iconName;
  }

  // Cache management
  private getCacheKey(calculation: StatsCalculation): string {
    const filtersKey = calculation.filters ? JSON.stringify(calculation.filters) : '';
    return `${calculation.dataSource}:${calculation.field}:${filtersKey}`;
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache[key];
    if (!cached) {
      this.cacheMetrics.misses++;
      return null;
    }

    if (new Date() > cached.expiresAt) {
      delete this.cache[key];
      this.cacheMetrics.misses++;
      return null;
    }

    // Update access tracking
    cached.hitCount++;
    cached.lastAccessed = new Date();
    this.cacheMetrics.hits++;

    return cached.data;
  }

  private setCache(key: string, data: any): void {
    // Calculate approximate size
    const size = this.calculateDataSize(data);

    // Check if we need to evict entries to stay under size limit
    this.evictIfNecessary(size);

    this.cache[key] = {
      data,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + this.config.cacheTimeout),
      hitCount: 0,
      lastAccessed: new Date(),
      size,
    };
  }

  // Calculate approximate size of data in bytes
  private calculateDataSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      // Fallback estimation
      return JSON.stringify(data).length * 2; // Rough estimate for UTF-16
    }
  }

  // Evict cache entries if necessary to stay under size limit
  private evictIfNecessary(newEntrySize: number): void {
    const currentSize = this.getCurrentCacheSize();

    if (currentSize + newEntrySize <= this.cacheMetrics.maxSize) {
      return;
    }

    // Sort entries by last accessed time (LRU eviction)
    const entries = Object.entries(this.cache).sort(
      ([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime()
    );

    let freedSize = 0;
    for (const [key, entry] of entries) {
      delete this.cache[key];
      freedSize += entry.size;
      this.cacheMetrics.evictions++;

      if (currentSize - freedSize + newEntrySize <= this.cacheMetrics.maxSize) {
        break;
      }
    }
  }

  // Get current cache size
  private getCurrentCacheSize(): number {
    return Object.values(this.cache).reduce((total, entry) => total + entry.size, 0);
  }

  // Get comprehensive cache metrics
  getCacheMetrics(): CacheMetrics {
    const entries = Object.values(this.cache);
    const totalSize = this.getCurrentCacheSize();
    const totalRequests = this.cacheMetrics.hits + this.cacheMetrics.misses;

    return {
      totalSize,
      totalEntries: entries.length,
      hitRate: totalRequests > 0 ? (this.cacheMetrics.hits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (this.cacheMetrics.misses / totalRequests) * 100 : 0,
      evictionCount: this.cacheMetrics.evictions,
      oldestEntry:
        entries.length > 0 ? new Date(Math.min(...entries.map(e => e.timestamp.getTime()))) : null,
      newestEntry:
        entries.length > 0 ? new Date(Math.max(...entries.map(e => e.timestamp.getTime()))) : null,
    };
  }

  // Clear expired cache entries
  clearExpiredCache(): number {
    const now = new Date();
    let clearedCount = 0;

    Object.keys(this.cache).forEach(key => {
      if (this.cache[key].expiresAt < now) {
        delete this.cache[key];
        clearedCount++;
      }
    });

    return clearedCount;
  }

  // Optimize cache by removing least used entries
  optimizeCache(targetSizeReduction: number = 0.3): void {
    const entries = Object.entries(this.cache);
    const targetRemovalCount = Math.floor(entries.length * targetSizeReduction);

    if (targetRemovalCount === 0) return;

    // Sort by hit count and last accessed (remove least valuable entries)
    const sortedEntries = entries.sort(([, a], [, b]) => {
      const scoreA = a.hitCount / Math.max(1, (Date.now() - a.lastAccessed.getTime()) / 1000);
      const scoreB = b.hitCount / Math.max(1, (Date.now() - b.lastAccessed.getTime()) / 1000);
      return scoreA - scoreB;
    });

    for (let i = 0; i < targetRemovalCount; i++) {
      const [key] = sortedEntries[i];
      delete this.cache[key];
      this.cacheMetrics.evictions++;
    }
  }

  // Real-time updates
  enableRealTimeUpdates(
    statsIds: string[],
    callback: (updatedStats: StatsCardData[]) => void
  ): void {
    if (!this.config.enableRealTime) return;

    statsIds.forEach(statsId => {
      if (this.refreshTimers[statsId]) {
        clearInterval(this.refreshTimers[statsId]);
      }

      this.refreshTimers[statsId] = setInterval(async () => {
        try {
          // Find the calculation for this stats ID
          const calculation = this.findCalculationById(statsId);
          if (calculation) {
            const updatedStat = await this.executeCalculation(calculation);
            callback([updatedStat]);
          }
        } catch (error) {
          console.error(`Failed to update real-time stats for ${statsId}:`, error);
        }
      }, this.config.refreshInterval);
    });
  }

  disableRealTimeUpdates(statsIds?: string[]): void {
    const idsToDisable = statsIds || Object.keys(this.refreshTimers);

    idsToDisable.forEach(statsId => {
      if (this.refreshTimers[statsId]) {
        clearInterval(this.refreshTimers[statsId]);
        delete this.refreshTimers[statsId];
      }
    });
  }

  // Find calculation by ID across all modules
  private findCalculationById(statsId: string): StatsCalculation | null {
    for (const moduleConfig of Object.values(this.moduleConfigs)) {
      const calculation = moduleConfig.calculations.find(calc => calc.id === statsId);
      if (calculation) return calculation;
    }
    return null;
  }

  // Refresh specific stats
  async refreshStats(statsIds: string[]): Promise<StatsCardData[]> {
    const refreshPromises = statsIds.map(async statsId => {
      const calculation = this.findCalculationById(statsId);
      if (!calculation) return null;

      // Clear cache for this calculation
      const cacheKey = this.getCacheKey(calculation);
      delete this.cache[cacheKey];

      // Execute fresh calculation
      return this.executeCalculation(calculation);
    });

    const results = await Promise.allSettled(refreshPromises);

    return results
      .filter(
        (result): result is PromiseFulfilledResult<StatsCardData> =>
          result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }

  // Aggregate stats for multi-module views
  async aggregateStats(
    modules: string[],
    permissions: PageId[],
    aggregationType: 'sum' | 'average' | 'count'
  ): Promise<StatsCardData[]> {
    const moduleStats = await Promise.all(
      modules.map(moduleId => this.calculateModuleStats(moduleId, permissions))
    );

    const flatStats = moduleStats.flat();
    const aggregatedStats: Record<string, StatsCardData> = {};

    // Group stats by category for aggregation
    flatStats.forEach(stat => {
      const key = `${stat.category}-${aggregationType}`;

      if (!aggregatedStats[key]) {
        aggregatedStats[key] = {
          id: key,
          title: `${stat.category} ${aggregationType.charAt(0).toUpperCase() + aggregationType.slice(1)}`,
          value: 0,
          icon: stat.icon,
          color: stat.color,
          category: stat.category,
          priority: stat.priority || 0,
        };
      }

      // Aggregate values based on type
      const currentValue = Number(aggregatedStats[key].value) || 0;
      const statValue = Number(stat.value) || 0;

      switch (aggregationType) {
        case 'sum':
          aggregatedStats[key].value = currentValue + statValue;
          break;
        case 'average':
          // This is a simplified average - in practice, you'd need to track count
          aggregatedStats[key].value = (currentValue + statValue) / 2;
          break;
        case 'count':
          aggregatedStats[key].value = currentValue + 1;
          break;
      }
    });

    return Object.values(aggregatedStats);
  }

  // Cleanup
  destroy(): void {
    this.disableRealTimeUpdates();
    this.cache = {};
  }
}

// Export singleton instance
export const statsCalculationEngine = new StatsCalculationEngine();
