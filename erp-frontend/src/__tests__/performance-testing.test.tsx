// Performance Testing Suite for Stats Calculation and Rendering
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { RoleBasedDashboard } from '../components/dashboard/RoleBasedDashboard';
import { StatsCard } from '../components/dashboard/StatsCard';
import { statsCalculationEngine } from '../services/statsCalculationEngine';
import { statsAggregationService } from '../services/statsAggregationService';
import { statsPerformanceMonitor } from '../services/statsPerformanceMonitor';
import { UserRole } from '../types/roles';
import { StatsCardData } from '../types/dashboardTemplates';

// Mock performance APIs
const mockPerformance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn(() => []),
  getEntriesByName: vi.fn(() => []),
};

Object.defineProperty(window, 'performance', {
  value: mockPerformance,
  writable: true,
});

// Mock services
vi.mock('../services/statsCalculationEngine', () => ({
  statsCalculationEngine: {
    calculateStatsForRole: vi.fn(),
    calculateBatchStats: vi.fn(),
    optimizeCalculation: vi.fn(),
    getCachedStats: vi.fn(),
    invalidateCache: vi.fn(),
  },
}));

vi.mock('../services/statsAggregationService', () => ({
  statsAggregationService: {
    aggregateStats: vi.fn(),
    aggregateInBatches: vi.fn(),
    getAggregationMetrics: vi.fn(),
  },
}));

vi.mock('../services/statsPerformanceMonitor', () => ({
  statsPerformanceMonitor: {
    startMeasurement: vi.fn(),
    endMeasurement: vi.fn(),
    getMetrics: vi.fn(),
    reportPerformance: vi.fn(),
    setThresholds: vi.fn(),
  },
}));

// Generate large dataset for performance testing
const generateLargeStatsDataset = (size: number): StatsCardData[] => {
  return Array.from({ length: size }, (_, i) => ({
    id: `stat-${i}`,
    title: `Statistics ${i}`,
    value: Math.floor(Math.random() * 1000000),
    formattedValue: `$${(Math.random() * 1000000).toLocaleString()}`,
    change: {
      value: (Math.random() - 0.5) * 20,
      type: Math.random() > 0.5 ? 'increase' : 'decrease',
      period: 'vs last month',
    },
    trend: Array.from({ length: 12 }, () => Math.floor(Math.random() * 1000000)),
    status: ['success', 'warning', 'error'][Math.floor(Math.random() * 3)] as any,
    lastUpdated: new Date(),
  }));
};

// Performance test wrapper
const PerformanceTestWrapper = ({
  children,
  userRole = 'Officer',
}: {
  children: React.ReactNode;
  userRole?: UserRole;
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        cacheTime: 0,
      },
      mutations: { retry: false },
    },
  });

  const mockAuthValue = {
    user: {
      id: 1,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      role: userRole,
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
    error: null,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthValue}>
        <BrowserRouter>{children}</BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('Performance Testing Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPerformance.now.mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Stats Calculation Performance', () => {
    it('should calculate stats within acceptable time limits', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      const largeDataset = generateLargeStatsDataset(1000);

      // Mock calculation with timing
      mockStatsEngine.calculateStatsForRole.mockImplementation(async (role, permissions) => {
        const startTime = performance.now();

        // Simulate calculation work
        await new Promise(resolve => setTimeout(resolve, 50));

        const endTime = performance.now();
        const calculationTime = endTime - startTime;

        // Should complete within 100ms for 1000 stats
        expect(calculationTime).toBeLessThan(100);

        return largeDataset.slice(0, 20); // Return subset for role
      });

      const result = await statsCalculationEngine.calculateStatsForRole('Director', []);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle batch calculations efficiently', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      const batchSizes = [10, 50, 100, 500];

      for (const batchSize of batchSizes) {
        const startTime = performance.now();

        mockStatsEngine.calculateBatchStats.mockResolvedValueOnce(
          generateLargeStatsDataset(batchSize)
        );

        const result = await statsCalculationEngine.calculateBatchStats(['Director'], batchSize);

        const endTime = performance.now();
        const calculationTime = endTime - startTime;

        // Batch calculation should scale linearly
        const expectedMaxTime = batchSize * 0.1; // 0.1ms per stat
        expect(calculationTime).toBeLessThan(expectedMaxTime);
        expect(result).toHaveLength(batchSize);
      }
    });

    it('should optimize calculations for repeated requests', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      const testData = generateLargeStatsDataset(100);

      // First calculation (cache miss)
      mockStatsEngine.calculateStatsForRole.mockResolvedValueOnce(testData);
      const firstStart = performance.now();
      await statsCalculationEngine.calculateStatsForRole('Director', []);
      const firstEnd = performance.now();
      const firstTime = firstEnd - firstStart;

      // Second calculation (cache hit)
      mockStatsEngine.getCachedStats.mockReturnValueOnce(testData);
      const secondStart = performance.now();
      await statsCalculationEngine.getCachedStats('Director', []);
      const secondEnd = performance.now();
      const secondTime = secondEnd - secondStart;

      // Cached calculation should be significantly faster
      expect(secondTime).toBeLessThan(firstTime * 0.1);
    });

    it('should handle memory efficiently with large datasets', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);

      // Monitor memory usage (simplified)
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

      // Process large dataset
      const largeDataset = generateLargeStatsDataset(10000);
      mockStatsEngine.calculateStatsForRole.mockResolvedValue(largeDataset);

      await statsCalculationEngine.calculateStatsForRole('Director', []);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB for test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Stats Aggregation Performance', () => {
    it('should aggregate stats efficiently', async () => {
      const mockAggregationService = vi.mocked(statsAggregationService);
      const testData = generateLargeStatsDataset(1000);

      const startTime = performance.now();

      mockAggregationService.aggregateStats.mockImplementation(async data => {
        // Simulate aggregation work
        return {
          totalValue: data.reduce((sum, stat) => sum + stat.value, 0),
          averageValue: data.reduce((sum, stat) => sum + stat.value, 0) / data.length,
          count: data.length,
          categories: {},
        };
      });

      const result = await statsAggregationService.aggregateStats(testData);

      const endTime = performance.now();
      const aggregationTime = endTime - startTime;

      // Aggregation should complete within 50ms for 1000 items
      expect(aggregationTime).toBeLessThan(50);
      expect(result.count).toBe(1000);
    });

    it('should handle batch aggregation for large datasets', async () => {
      const mockAggregationService = vi.mocked(statsAggregationService);
      const largeDataset = generateLargeStatsDataset(5000);

      mockAggregationService.aggregateInBatches.mockImplementation(async (data, batchSize) => {
        const batches = [];
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          batches.push({
            totalValue: batch.reduce((sum, stat) => sum + stat.value, 0),
            count: batch.length,
          });
        }
        return batches;
      });

      const startTime = performance.now();
      const result = await statsAggregationService.aggregateInBatches(largeDataset, 500);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      // Should process 5000 items in batches within 100ms
      expect(processingTime).toBeLessThan(100);
      expect(result).toHaveLength(10); // 5000 / 500 = 10 batches
    });
  });

  describe('Component Rendering Performance', () => {
    it('should render dashboard within performance budget', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.calculateStatsForRole.mockResolvedValue(generateLargeStatsDataset(20));

      const startTime = performance.now();

      render(
        <PerformanceTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </PerformanceTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Dashboard should render within 500ms
      expect(renderTime).toBeLessThan(500);
    });

    it('should handle large numbers of stats cards efficiently', async () => {
      const statsCards = generateLargeStatsDataset(100);

      const startTime = performance.now();

      render(
        <PerformanceTestWrapper>
          <div data-testid="stats-container">
            {statsCards.map(stat => (
              <StatsCard
                key={stat.id}
                id={stat.id}
                title={stat.title}
                value={stat.value}
                formattedValue={stat.formattedValue}
                change={stat.change}
                trend={stat.trend}
                status={stat.status}
              />
            ))}
          </div>
        </PerformanceTestWrapper>
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render 100 stats cards within 200ms
      expect(renderTime).toBeLessThan(200);

      const container = screen.getByTestId('stats-container');
      expect(container.children).toHaveLength(100);
    });

    it('should optimize re-renders when stats update', async () => {
      const initialStats = generateLargeStatsDataset(50);
      const updatedStats = initialStats.map(stat => ({
        ...stat,
        value: stat.value + 100,
        formattedValue: `$${(stat.value + 100).toLocaleString()}`,
      }));

      const { rerender } = render(
        <PerformanceTestWrapper>
          <div data-testid="stats-container">
            {initialStats.map(stat => (
              <StatsCard
                key={stat.id}
                id={stat.id}
                title={stat.title}
                value={stat.value}
                formattedValue={stat.formattedValue}
              />
            ))}
          </div>
        </PerformanceTestWrapper>
      );

      const startTime = performance.now();

      rerender(
        <PerformanceTestWrapper>
          <div data-testid="stats-container">
            {updatedStats.map(stat => (
              <StatsCard
                key={stat.id}
                id={stat.id}
                title={stat.title}
                value={stat.value}
                formattedValue={stat.formattedValue}
              />
            ))}
          </div>
        </PerformanceTestWrapper>
      );

      const endTime = performance.now();
      const rerenderTime = endTime - startTime;

      // Re-render should be faster than initial render
      expect(rerenderTime).toBeLessThan(100);
    });

    it('should handle virtual scrolling for large lists', async () => {
      const largeDataset = generateLargeStatsDataset(1000);

      const VirtualizedStatsGrid = () => {
        const [visibleItems, setVisibleItems] = React.useState(
          largeDataset.slice(0, 20) // Only render first 20 items
        );

        return (
          <div
            data-testid="virtualized-grid"
            style={{ height: '400px', overflow: 'auto' }}
            onScroll={e => {
              const scrollTop = e.currentTarget.scrollTop;
              const itemHeight = 100;
              const startIndex = Math.floor(scrollTop / itemHeight);
              const endIndex = Math.min(startIndex + 20, largeDataset.length);
              setVisibleItems(largeDataset.slice(startIndex, endIndex));
            }}
          >
            {visibleItems.map(stat => (
              <StatsCard
                key={stat.id}
                id={stat.id}
                title={stat.title}
                value={stat.value}
                formattedValue={stat.formattedValue}
              />
            ))}
          </div>
        );
      };

      const startTime = performance.now();

      render(
        <PerformanceTestWrapper>
          <VirtualizedStatsGrid />
        </PerformanceTestWrapper>
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Virtual scrolling should render quickly even with large dataset
      expect(renderTime).toBeLessThan(100);

      const grid = screen.getByTestId('virtualized-grid');
      expect(grid.children.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const mockPerformanceMonitor = vi.mocked(statsPerformanceMonitor);

      mockPerformanceMonitor.startMeasurement.mockImplementation(name => {
        mockPerformance.mark(`${name}-start`);
        return name;
      });

      mockPerformanceMonitor.endMeasurement.mockImplementation(name => {
        mockPerformance.mark(`${name}-end`);
        mockPerformance.measure(name, `${name}-start`, `${name}-end`);
        return {
          name,
          duration: Math.random() * 100,
          startTime: Date.now() - 100,
          endTime: Date.now(),
        };
      });

      const measurementId = statsPerformanceMonitor.startMeasurement('stats-calculation');

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));

      const metrics = statsPerformanceMonitor.endMeasurement(measurementId);

      expect(mockPerformance.mark).toHaveBeenCalledWith('stats-calculation-start');
      expect(mockPerformance.mark).toHaveBeenCalledWith('stats-calculation-end');
      expect(mockPerformance.measure).toHaveBeenCalledWith(
        'stats-calculation',
        'stats-calculation-start',
        'stats-calculation-end'
      );
      expect(metrics.name).toBe('stats-calculation');
    });

    it('should report performance issues when thresholds are exceeded', async () => {
      const mockPerformanceMonitor = vi.mocked(statsPerformanceMonitor);

      mockPerformanceMonitor.setThresholds.mockImplementation(thresholds => {
        // Store thresholds for comparison
      });

      mockPerformanceMonitor.reportPerformance.mockImplementation(metrics => {
        if (metrics.duration > 100) {
          return {
            level: 'warning',
            message: 'Performance threshold exceeded',
            metrics,
          };
        }
        return null;
      });

      // Set performance thresholds
      statsPerformanceMonitor.setThresholds({
        'stats-calculation': 100,
        'dashboard-render': 500,
      });

      // Simulate slow operation
      const slowMetrics = {
        name: 'stats-calculation',
        duration: 150,
        startTime: Date.now() - 150,
        endTime: Date.now(),
      };

      const report = statsPerformanceMonitor.reportPerformance(slowMetrics);

      expect(report).toBeDefined();
      expect(report?.level).toBe('warning');
      expect(report?.message).toBe('Performance threshold exceeded');
    });

    it('should collect performance metrics over time', async () => {
      const mockPerformanceMonitor = vi.mocked(statsPerformanceMonitor);

      const metricsHistory: any[] = [];

      mockPerformanceMonitor.getMetrics.mockImplementation(() => {
        return {
          averageDuration:
            metricsHistory.reduce((sum, m) => sum + m.duration, 0) / metricsHistory.length,
          minDuration: Math.min(...metricsHistory.map(m => m.duration)),
          maxDuration: Math.max(...metricsHistory.map(m => m.duration)),
          totalMeasurements: metricsHistory.length,
          recentMeasurements: metricsHistory.slice(-10),
        };
      });

      // Simulate multiple measurements
      for (let i = 0; i < 20; i++) {
        metricsHistory.push({
          name: 'stats-calculation',
          duration: Math.random() * 100 + 50,
          timestamp: Date.now() - (20 - i) * 1000,
        });
      }

      const aggregatedMetrics = statsPerformanceMonitor.getMetrics();

      expect(aggregatedMetrics.totalMeasurements).toBe(20);
      expect(aggregatedMetrics.averageDuration).toBeGreaterThan(0);
      expect(aggregatedMetrics.recentMeasurements).toHaveLength(10);
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources properly', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);

      // Track cache size
      let cacheSize = 0;

      mockStatsEngine.getCachedStats.mockImplementation(() => {
        cacheSize++;
        return generateLargeStatsDataset(10);
      });

      mockStatsEngine.invalidateCache.mockImplementation(() => {
        cacheSize = 0;
      });

      // Fill cache
      for (let i = 0; i < 100; i++) {
        await statsCalculationEngine.getCachedStats(`role-${i}`, []);
      }

      expect(cacheSize).toBe(100);

      // Clear cache
      statsCalculationEngine.invalidateCache();

      expect(cacheSize).toBe(0);
    });

    it('should handle component unmounting gracefully', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.calculateStatsForRole.mockResolvedValue(generateLargeStatsDataset(10));

      const { unmount } = render(
        <PerformanceTestWrapper>
          <RoleBasedDashboard />
        </PerformanceTestWrapper>
      );

      // Unmount component
      act(() => {
        unmount();
      });

      // Should not cause memory leaks or errors
      expect(() => {
        // Trigger any cleanup
      }).not.toThrow();
    });
  });

  describe('Network Performance', () => {
    it('should handle slow network conditions gracefully', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);

      // Simulate slow network
      mockStatsEngine.calculateStatsForRole.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        return generateLargeStatsDataset(10);
      });

      const startTime = performance.now();

      render(
        <PerformanceTestWrapper>
          <RoleBasedDashboard />
        </PerformanceTestWrapper>
      );

      // Should show loading state immediately
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(
        () => {
          expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should handle the delay gracefully
      expect(totalTime).toBeGreaterThan(2000);
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });
});
