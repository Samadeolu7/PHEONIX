// Stats aggregation service for multi-module dashboard views
import { StatsCardData } from '../components/dashboard/StatsCard';
import { UserRole } from '../types/roles';
import { PageId, FunctionalCategory } from '../types/permissions';
import { statsCalculationEngine } from './statsCalculationEngine';

export interface AggregationRule {
  id: string;
  title: string;
  description: string;
  sourceModules: string[];
  targetCategory: FunctionalCategory;
  aggregationType: 'sum' | 'average' | 'count' | 'percentage' | 'trend';
  field: string;
  format: 'number' | 'currency' | 'percentage';
  icon: string;
  color: StatsCardData['color'];
  priority: number;
  permissions: PageId[];
}

export interface AggregationConfig {
  role: UserRole;
  rules: AggregationRule[];
  refreshInterval: number;
  enableRealTime: boolean;
}

export interface ModuleStatsGroup {
  moduleId: string;
  stats: StatsCardData[];
  weight: number; // For weighted averages
}

export class StatsAggregationService {
  private aggregationConfigs: Record<UserRole, AggregationConfig>;
  private cache: Map<string, { data: StatsCardData[]; timestamp: Date }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.aggregationConfigs = this.initializeAggregationConfigs();
  }

  // Initialize role-specific aggregation configurations
  private initializeAggregationConfigs(): Record<UserRole, AggregationConfig> {
    return {
      Director: {
        role: 'Director',
        refreshInterval: 30000,
        enableRealTime: true,
        rules: [
          {
            id: 'total-financial-health',
            title: 'Financial Health Score',
            description: 'Overall financial performance indicator',
            sourceModules: ['financial', 'client-services'],
            targetCategory: 'Financial Operations',
            aggregationType: 'percentage',
            field: 'health_score',
            format: 'percentage',
            icon: 'TrendingUp',
            color: 'green',
            priority: 10,
            permissions: ['financial.receivables_dashboard', 'financial.accounts_management'],
          },
          {
            id: 'operational-efficiency',
            title: 'Operational Efficiency',
            description: 'Combined efficiency across all operations',
            sourceModules: ['operations', 'administration'],
            targetCategory: 'Operations',
            aggregationType: 'average',
            field: 'efficiency_score',
            format: 'percentage',
            icon: 'Zap',
            color: 'blue',
            priority: 9,
            permissions: ['operations.procurement_dashboard', 'operations.inventory_management'],
          },
          {
            id: 'total-revenue-trend',
            title: 'Total Revenue Trend',
            description: 'Combined revenue from all sources',
            sourceModules: ['financial', 'client-services'],
            targetCategory: 'Financial Operations',
            aggregationType: 'sum',
            field: 'revenue',
            format: 'currency',
            icon: 'DollarSign',
            color: 'green',
            priority: 8,
            permissions: ['financial.accounts_management'],
          },
        ],
      },
      Principal: {
        role: 'Principal',
        refreshInterval: 45000,
        enableRealTime: true,
        rules: [
          {
            id: 'student-performance-overview',
            title: 'Student Performance Overview',
            description: 'Academic and financial performance combined',
            sourceModules: ['client-services', 'financial'],
            targetCategory: 'Client Management',
            aggregationType: 'average',
            field: 'performance_score',
            format: 'percentage',
            icon: 'GraduationCap',
            color: 'blue',
            priority: 8,
            permissions: ['students.client_management', 'students.entitlements'],
          },
          {
            id: 'fee-collection-efficiency',
            title: 'Fee Collection Efficiency',
            description: 'Overall fee collection performance',
            sourceModules: ['financial', 'client-services'],
            targetCategory: 'Financial Operations',
            aggregationType: 'percentage',
            field: 'collection_rate',
            format: 'percentage',
            icon: 'Target',
            color: 'green',
            priority: 7,
            permissions: ['financial.receivables_dashboard'],
          },
        ],
      },
      Administrator: {
        role: 'Administrator',
        refreshInterval: 60000,
        enableRealTime: true,
        rules: [
          {
            id: 'system-utilization',
            title: 'System Utilization',
            description: 'Overall system usage across all modules',
            sourceModules: ['administration', 'financial', 'operations'],
            targetCategory: 'System Administration',
            aggregationType: 'average',
            field: 'utilization_rate',
            format: 'percentage',
            icon: 'Activity',
            color: 'blue',
            priority: 6,
            permissions: ['admin.system_settings'],
          },
          {
            id: 'data-integrity-score',
            title: 'Data Integrity Score',
            description: 'Data quality across all modules',
            sourceModules: ['financial', 'client-services', 'operations'],
            targetCategory: 'System Administration',
            aggregationType: 'average',
            field: 'integrity_score',
            format: 'percentage',
            icon: 'Shield',
            color: 'green',
            priority: 5,
            permissions: ['admin.system_settings'],
          },
        ],
      },
      Registrar: {
        role: 'Registrar',
        refreshInterval: 60000,
        enableRealTime: false,
        rules: [
          {
            id: 'student-lifecycle-completion',
            title: 'Student Lifecycle Completion',
            description: 'Overall completion rate of student processes',
            sourceModules: ['client-services', 'financial'],
            targetCategory: 'Client Management',
            aggregationType: 'percentage',
            field: 'completion_rate',
            format: 'percentage',
            icon: 'CheckCircle2',
            color: 'green',
            priority: 4,
            permissions: ['students.client_management', 'students.entitlements'],
          },
        ],
      },
      Officer: {
        role: 'Officer',
        refreshInterval: 120000,
        enableRealTime: false,
        rules: [
          {
            id: 'daily-task-completion',
            title: 'Daily Task Completion',
            description: 'Completion rate of daily operational tasks',
            sourceModules: ['operations', 'financial'],
            targetCategory: 'Operations',
            aggregationType: 'percentage',
            field: 'task_completion_rate',
            format: 'percentage',
            icon: 'CheckSquare',
            color: 'blue',
            priority: 3,
            permissions: ['operations.procurement_dashboard'],
          },
        ],
      },
    };
  }

  // Aggregate stats for a specific role across multiple modules
  async aggregateStatsForRole(
    role: UserRole,
    modules: string[],
    permissions: PageId[]
  ): Promise<StatsCardData[]> {
    const config = this.aggregationConfigs[role];
    if (!config) {
      return [];
    }

    // Check cache first
    const cacheKey = `${role}-${modules.join(',')}-${permissions.join(',')}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get individual module stats
      const moduleStatsGroups = await this.getModuleStatsGroups(modules, permissions);

      // Apply aggregation rules
      const aggregatedStats = await this.applyAggregationRules(
        config.rules,
        moduleStatsGroups,
        permissions
      );

      // Cache the results
      this.setCache(cacheKey, aggregatedStats);

      return aggregatedStats;
    } catch (error) {
      console.error('Failed to aggregate stats for role:', role, error);
      return [];
    }
  }

  // Get stats grouped by module
  private async getModuleStatsGroups(
    modules: string[],
    permissions: PageId[]
  ): Promise<ModuleStatsGroup[]> {
    const moduleStatsPromises = modules.map(async moduleId => {
      const stats = await statsCalculationEngine.calculateModuleStats(moduleId, permissions);
      return {
        moduleId,
        stats,
        weight: this.getModuleWeight(moduleId),
      };
    });

    return Promise.all(moduleStatsPromises);
  }

  // Get weight for module in aggregations (some modules are more important)
  private getModuleWeight(moduleId: string): number {
    const weights: Record<string, number> = {
      financial: 1.0,
      'client-services': 0.8,
      operations: 0.6,
      administration: 0.4,
    };
    return weights[moduleId] || 0.5;
  }

  // Apply aggregation rules to module stats
  private async applyAggregationRules(
    rules: AggregationRule[],
    moduleStatsGroups: ModuleStatsGroup[],
    userPermissions: PageId[]
  ): Promise<StatsCardData[]> {
    const aggregatedStats: StatsCardData[] = [];

    for (const rule of rules) {
      // Check if user has required permissions
      if (!rule.permissions.some(permission => userPermissions.includes(permission))) {
        continue;
      }

      // Filter module groups that match this rule
      const relevantGroups = moduleStatsGroups.filter(group =>
        rule.sourceModules.includes(group.moduleId)
      );

      if (relevantGroups.length === 0) {
        continue;
      }

      try {
        const aggregatedStat = await this.executeAggregationRule(rule, relevantGroups);
        if (aggregatedStat) {
          aggregatedStats.push(aggregatedStat);
        }
      } catch (error) {
        console.error(`Failed to execute aggregation rule ${rule.id}:`, error);
      }
    }

    return aggregatedStats.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  // Execute a single aggregation rule
  private async executeAggregationRule(
    rule: AggregationRule,
    moduleGroups: ModuleStatsGroup[]
  ): Promise<StatsCardData | null> {
    const values: number[] = [];
    const weights: number[] = [];
    let hasChange = false;
    let totalChange = 0;
    let changeCount = 0;

    // Extract values from relevant stats
    moduleGroups.forEach(group => {
      group.stats.forEach(stat => {
        if (this.isStatRelevantToRule(stat, rule)) {
          const numValue = this.extractNumericValue(stat.value);
          if (numValue !== null) {
            values.push(numValue);
            weights.push(group.weight);

            // Aggregate change indicators
            if (stat.change) {
              hasChange = true;
              totalChange += stat.change.value;
              changeCount++;
            }
          }
        }
      });
    });

    if (values.length === 0) {
      return null;
    }

    // Calculate aggregated value
    let aggregatedValue: number;
    switch (rule.aggregationType) {
      case 'sum':
        aggregatedValue = values.reduce((sum, val) => sum + val, 0);
        break;
      case 'average':
        aggregatedValue = this.calculateWeightedAverage(values, weights);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      case 'percentage':
        // For percentages, use weighted average
        aggregatedValue = this.calculateWeightedAverage(values, weights);
        break;
      case 'trend':
        // For trends, calculate the overall trend direction
        aggregatedValue = this.calculateTrendValue(values, weights);
        break;
      default:
        aggregatedValue = values[0];
    }

    // Calculate aggregated change
    let change: StatsCardData['change'];
    if (hasChange && changeCount > 0) {
      const avgChange = totalChange / changeCount;
      change = {
        value: Math.round(avgChange * 10) / 10,
        type: avgChange >= 0 ? 'increase' : 'decrease',
        period: 'aggregated',
      };
    }

    return {
      id: rule.id,
      title: rule.title,
      value: aggregatedValue,
      change,
      icon: rule.icon as any, // Will be resolved to actual icon component
      color: rule.color,
      category: rule.targetCategory,
      priority: rule.priority,
      format: rule.format,
      lastUpdated: new Date(),
    };
  }

  // Check if a stat is relevant to an aggregation rule
  private isStatRelevantToRule(stat: StatsCardData, rule: AggregationRule): boolean {
    // Match by category or specific field patterns
    if (stat.category === rule.targetCategory) {
      return true;
    }

    // Match by field patterns in the rule
    const fieldPatterns = {
      health_score: ['revenue', 'receivables', 'collection'],
      efficiency_score: ['completion', 'utilization', 'performance'],
      revenue: ['revenue', 'income', 'collection'],
      performance_score: ['completion', 'enrollment', 'entitlement'],
      collection_rate: ['collection', 'payment', 'receivables'],
      utilization_rate: ['active', 'usage', 'utilization'],
      integrity_score: ['accuracy', 'integrity', 'quality'],
      completion_rate: ['completion', 'finished', 'done'],
      task_completion_rate: ['task', 'completion', 'pending'],
    };

    const patterns = fieldPatterns[rule.field] || [];
    return patterns.some(
      pattern =>
        stat.title.toLowerCase().includes(pattern) || stat.id.toLowerCase().includes(pattern)
    );
  }

  // Extract numeric value from stat value
  private extractNumericValue(value: string | number): number | null {
    if (typeof value === 'number') {
      return value;
    }

    // Remove currency symbols, commas, and percentage signs
    const cleaned = value.replace(/[₦,$,%]/g, '').replace(/,/g, '');
    const parsed = parseFloat(cleaned);

    return isNaN(parsed) ? null : parsed;
  }

  // Calculate weighted average
  private calculateWeightedAverage(values: number[], weights: number[]): number {
    if (values.length !== weights.length || values.length === 0) {
      return 0;
    }

    const weightedSum = values.reduce((sum, val, index) => sum + val * weights[index], 0);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  // Calculate trend value (simplified trend analysis)
  private calculateTrendValue(values: number[], weights: number[]): number {
    if (values.length < 2) {
      return values[0] || 0;
    }

    // Simple trend calculation: compare first half vs second half
    const midpoint = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, midpoint);
    const secondHalf = values.slice(midpoint);

    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    return ((secondAvg - firstAvg) / firstAvg) * 100;
  }

  // Cache management
  private getFromCache(key: string): StatsCardData[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp.getTime() > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: StatsCardData[]): void {
    this.cache.set(key, {
      data,
      timestamp: new Date(),
    });
  }

  // Get aggregation rules for a specific role
  getAggregationRulesForRole(role: UserRole): AggregationRule[] {
    const config = this.aggregationConfigs[role];
    return config ? config.rules : [];
  }

  // Update aggregation configuration
  updateAggregationConfig(role: UserRole, config: Partial<AggregationConfig>): void {
    if (this.aggregationConfigs[role]) {
      this.aggregationConfigs[role] = {
        ...this.aggregationConfigs[role],
        ...config,
      };
    }
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const statsAggregationService = new StatsAggregationService();
