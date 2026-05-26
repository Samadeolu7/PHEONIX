// Stats performance monitoring and optimization service
import { StatsCardData } from '../components/dashboard/StatsCard';
import { UserRole } from '../types/roles';
import { PageId } from '../types/permissions';

export interface PerformanceMetrics {
  // Timing metrics
  averageLoadTime: number;
  medianLoadTime: number;
  maxLoadTime: number;
  minLoadTime: number;

  // Request metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retryCount: number;

  // Cache metrics
  cacheHitRate: number;
  cacheMissRate: number;
  cacheSize: number;
  cacheEvictions: number;

  // Real-time metrics
  activeConnections: number;
  updateFrequency: number;
  dataFreshness: number; // Average age of data in seconds

  // Error metrics
  errorRate: number;
  commonErrors: Array<{
    error: string;
    count: number;
    lastOccurrence: Date;
  }>;

  // Resource usage
  memoryUsage: number;
  cpuUsage: number;
  networkBandwidth: number;
}

export interface PerformanceAlert {
  id: string;
  type: 'warning' | 'error' | 'critical';
  metric: keyof PerformanceMetrics;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface OptimizationSuggestion {
  id: string;
  category: 'cache' | 'network' | 'computation' | 'ui';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  implementation: string;
  estimatedImprovement: string;
}

export interface PerformanceProfile {
  role: UserRole;
  modules: string[];
  averageStatsCount: number;
  averageLoadTime: number;
  peakUsageHours: number[];
  commonBottlenecks: string[];
  optimizationOpportunities: OptimizationSuggestion[];
}

export class StatsPerformanceMonitor {
  private metrics: PerformanceMetrics;
  private loadTimes: number[] = [];
  private errors: Map<string, { count: number; lastOccurrence: Date }> = new Map();
  private alerts: PerformanceAlert[] = [];
  private profiles: Map<UserRole, PerformanceProfile> = new Map();
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Performance thresholds
  private readonly thresholds = {
    maxLoadTime: 5000, // 5 seconds
    maxErrorRate: 5, // 5%
    minCacheHitRate: 70, // 70%
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    maxRetryRate: 10, // 10%
  };

  constructor() {
    this.metrics = this.initializeMetrics();
    this.initializeProfiles();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      averageLoadTime: 0,
      medianLoadTime: 0,
      maxLoadTime: 0,
      minLoadTime: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retryCount: 0,
      cacheHitRate: 0,
      cacheMissRate: 0,
      cacheSize: 0,
      cacheEvictions: 0,
      activeConnections: 0,
      updateFrequency: 0,
      dataFreshness: 0,
      errorRate: 0,
      commonErrors: [],
      memoryUsage: 0,
      cpuUsage: 0,
      networkBandwidth: 0,
    };
  }

  private initializeProfiles(): void {
    const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

    roles.forEach(role => {
      this.profiles.set(role, {
        role,
        modules: [],
        averageStatsCount: 0,
        averageLoadTime: 0,
        peakUsageHours: [],
        commonBottlenecks: [],
        optimizationOpportunities: [],
      });
    });
  }

  // Start performance monitoring
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzePerformance();
      this.generateOptimizationSuggestions();
    }, intervalMs);

    console.log('📊 Stats performance monitoring started');
  }

  // Stop performance monitoring
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('📊 Stats performance monitoring stopped');
  }

  // Record a stats loading operation
  recordStatsLoad(
    role: UserRole,
    modules: string[],
    statsCount: number,
    loadTime: number,
    success: boolean,
    error?: string
  ): void {
    // Update basic metrics
    this.metrics.totalRequests++;
    this.loadTimes.push(loadTime);

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (error) {
        this.recordError(error);
      }
    }

    // Update timing metrics
    this.updateTimingMetrics();

    // Update role profile
    this.updateRoleProfile(role, modules, statsCount, loadTime);

    // Check for performance alerts
    this.checkPerformanceThresholds();
  }

  private updateTimingMetrics(): void {
    if (this.loadTimes.length === 0) return;

    const sortedTimes = [...this.loadTimes].sort((a, b) => a - b);

    this.metrics.averageLoadTime =
      this.loadTimes.reduce((sum, time) => sum + time, 0) / this.loadTimes.length;
    this.metrics.medianLoadTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
    this.metrics.maxLoadTime = Math.max(...this.loadTimes);
    this.metrics.minLoadTime = Math.min(...this.loadTimes);
    this.metrics.errorRate = (this.metrics.failedRequests / this.metrics.totalRequests) * 100;

    // Keep only recent load times (last 100 requests)
    if (this.loadTimes.length > 100) {
      this.loadTimes = this.loadTimes.slice(-100);
    }
  }

  private updateRoleProfile(
    role: UserRole,
    modules: string[],
    statsCount: number,
    loadTime: number
  ): void {
    const profile = this.profiles.get(role);
    if (!profile) return;

    // Update modules
    modules.forEach(module => {
      if (!profile.modules.includes(module)) {
        profile.modules.push(module);
      }
    });

    // Update averages (simple moving average)
    const alpha = 0.1; // Smoothing factor
    profile.averageStatsCount = profile.averageStatsCount * (1 - alpha) + statsCount * alpha;
    profile.averageLoadTime = profile.averageLoadTime * (1 - alpha) + loadTime * alpha;

    // Track peak usage hours
    const currentHour = new Date().getHours();
    if (!profile.peakUsageHours.includes(currentHour)) {
      profile.peakUsageHours.push(currentHour);
      profile.peakUsageHours.sort((a, b) => a - b);
    }
  }

  private recordError(error: string): void {
    const existing = this.errors.get(error);
    if (existing) {
      existing.count++;
      existing.lastOccurrence = new Date();
    } else {
      this.errors.set(error, {
        count: 1,
        lastOccurrence: new Date(),
      });
    }

    // Update common errors in metrics
    this.metrics.commonErrors = Array.from(this.errors.entries())
      .map(([error, data]) => ({ error, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // Collect system metrics
  private collectMetrics(): void {
    // Memory usage (approximate)
    if (performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
    }

    // Update cache metrics from stats engine (would need to be passed in)
    // This is a placeholder - in real implementation, you'd get these from the cache
    this.metrics.cacheSize = 0;
    this.metrics.cacheHitRate = 0;
    this.metrics.cacheMissRate = 0;
    this.metrics.cacheEvictions = 0;
  }

  // Analyze performance and identify issues
  private analyzePerformance(): void {
    const issues: string[] = [];

    // Analyze load times
    if (this.metrics.averageLoadTime > 3000) {
      issues.push('High average load time');
    }

    // Analyze error rates
    if (this.metrics.errorRate > 5) {
      issues.push('High error rate');
    }

    // Analyze cache performance
    if (this.metrics.cacheHitRate < 70) {
      issues.push('Low cache hit rate');
    }

    // Update profiles with identified bottlenecks
    this.profiles.forEach(profile => {
      profile.commonBottlenecks = issues;
    });
  }

  // Generate optimization suggestions
  private generateOptimizationSuggestions(): void {
    const suggestions: OptimizationSuggestion[] = [];

    // Cache optimization suggestions
    if (this.metrics.cacheHitRate < 70) {
      suggestions.push({
        id: 'cache-optimization',
        category: 'cache',
        priority: 'high',
        title: 'Improve Cache Hit Rate',
        description: 'Cache hit rate is below optimal threshold',
        impact: 'Reduce API calls and improve response times',
        implementation: 'Increase cache timeout and optimize cache keys',
        estimatedImprovement: '30-50% faster load times',
      });
    }

    // Network optimization suggestions
    if (this.metrics.averageLoadTime > 3000) {
      suggestions.push({
        id: 'network-optimization',
        category: 'network',
        priority: 'medium',
        title: 'Optimize Network Requests',
        description: 'Average load time exceeds recommended threshold',
        impact: 'Improve user experience and reduce waiting time',
        implementation: 'Implement request batching and compression',
        estimatedImprovement: '20-40% faster load times',
      });
    }

    // Error handling suggestions
    if (this.metrics.errorRate > 5) {
      suggestions.push({
        id: 'error-handling',
        category: 'network',
        priority: 'high',
        title: 'Improve Error Handling',
        description: 'High error rate detected',
        impact: 'Reduce failed requests and improve reliability',
        implementation: 'Implement better retry logic and error recovery',
        estimatedImprovement: '50-70% reduction in failed requests',
      });
    }

    // UI optimization suggestions
    if (this.metrics.averageLoadTime > 2000) {
      suggestions.push({
        id: 'ui-optimization',
        category: 'ui',
        priority: 'medium',
        title: 'Implement Progressive Loading',
        description: 'Load times could be improved with better UX',
        impact: 'Better perceived performance',
        implementation: 'Add skeleton loading states and progressive data loading',
        estimatedImprovement: 'Improved perceived performance by 40-60%',
      });
    }

    // Update profiles with suggestions
    this.profiles.forEach(profile => {
      profile.optimizationOpportunities = suggestions;
    });
  }

  // Check performance thresholds and generate alerts
  private checkPerformanceThresholds(): void {
    const newAlerts: PerformanceAlert[] = [];

    // Check load time threshold
    if (this.metrics.averageLoadTime > this.thresholds.maxLoadTime) {
      newAlerts.push({
        id: `alert-${Date.now()}-loadtime`,
        type: 'warning',
        metric: 'averageLoadTime',
        threshold: this.thresholds.maxLoadTime,
        currentValue: this.metrics.averageLoadTime,
        message: `Average load time (${this.metrics.averageLoadTime}ms) exceeds threshold (${this.thresholds.maxLoadTime}ms)`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // Check error rate threshold
    if (this.metrics.errorRate > this.thresholds.maxErrorRate) {
      newAlerts.push({
        id: `alert-${Date.now()}-errorrate`,
        type: 'error',
        metric: 'errorRate',
        threshold: this.thresholds.maxErrorRate,
        currentValue: this.metrics.errorRate,
        message: `Error rate (${this.metrics.errorRate}%) exceeds threshold (${this.thresholds.maxErrorRate}%)`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // Check cache hit rate threshold
    if (
      this.metrics.cacheHitRate < this.thresholds.minCacheHitRate &&
      this.metrics.totalRequests > 10
    ) {
      newAlerts.push({
        id: `alert-${Date.now()}-cachehit`,
        type: 'warning',
        metric: 'cacheHitRate',
        threshold: this.thresholds.minCacheHitRate,
        currentValue: this.metrics.cacheHitRate,
        message: `Cache hit rate (${this.metrics.cacheHitRate}%) below threshold (${this.thresholds.minCacheHitRate}%)`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // Add new alerts
    this.alerts.push(...newAlerts);

    // Keep only recent alerts (last 50)
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
  }

  // Public API methods
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getAlerts(unacknowledgedOnly: boolean = false): PerformanceAlert[] {
    return unacknowledgedOnly ? this.alerts.filter(alert => !alert.acknowledged) : [...this.alerts];
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  getRoleProfile(role: UserRole): PerformanceProfile | undefined {
    return this.profiles.get(role);
  }

  getAllProfiles(): PerformanceProfile[] {
    return Array.from(this.profiles.values());
  }

  getOptimizationSuggestions(
    category?: OptimizationSuggestion['category']
  ): OptimizationSuggestion[] {
    const allSuggestions = Array.from(this.profiles.values()).flatMap(
      profile => profile.optimizationOpportunities
    );

    if (category) {
      return allSuggestions.filter(suggestion => suggestion.category === category);
    }

    return allSuggestions;
  }

  // Performance reporting
  generatePerformanceReport(): {
    summary: {
      overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
      keyMetrics: Partial<PerformanceMetrics>;
      criticalIssues: number;
      warnings: number;
    };
    details: {
      metrics: PerformanceMetrics;
      alerts: PerformanceAlert[];
      profiles: PerformanceProfile[];
      suggestions: OptimizationSuggestion[];
    };
  } {
    const criticalAlerts = this.alerts.filter(a => a.type === 'critical' && !a.acknowledged);
    const warningAlerts = this.alerts.filter(a => a.type === 'warning' && !a.acknowledged);

    // Determine overall health
    let overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
    if (criticalAlerts.length > 0) {
      overallHealth = 'poor';
    } else if (warningAlerts.length > 2 || this.metrics.errorRate > 3) {
      overallHealth = 'fair';
    } else if (warningAlerts.length > 0 || this.metrics.averageLoadTime > 2000) {
      overallHealth = 'good';
    } else {
      overallHealth = 'excellent';
    }

    return {
      summary: {
        overallHealth,
        keyMetrics: {
          averageLoadTime: this.metrics.averageLoadTime,
          errorRate: this.metrics.errorRate,
          cacheHitRate: this.metrics.cacheHitRate,
          totalRequests: this.metrics.totalRequests,
        },
        criticalIssues: criticalAlerts.length,
        warnings: warningAlerts.length,
      },
      details: {
        metrics: this.getMetrics(),
        alerts: this.getAlerts(),
        profiles: this.getAllProfiles(),
        suggestions: this.getOptimizationSuggestions(),
      },
    };
  }

  // Reset metrics (useful for testing or periodic resets)
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.loadTimes = [];
    this.errors.clear();
    this.alerts = [];
    console.log('📊 Performance metrics reset');
  }

  // Update cache metrics (to be called by cache systems)
  updateCacheMetrics(hitRate: number, missRate: number, size: number, evictions: number): void {
    this.metrics.cacheHitRate = hitRate;
    this.metrics.cacheMissRate = missRate;
    this.metrics.cacheSize = size;
    this.metrics.cacheEvictions = evictions;
  }

  // Update real-time metrics
  updateRealTimeMetrics(
    activeConnections: number,
    updateFrequency: number,
    dataFreshness: number
  ): void {
    this.metrics.activeConnections = activeConnections;
    this.metrics.updateFrequency = updateFrequency;
    this.metrics.dataFreshness = dataFreshness;
  }
}

// Export singleton instance
export const statsPerformanceMonitor = new StatsPerformanceMonitor();
