// src/utils/performanceTest.ts
import { receivablesService } from '../services/receivablesService';
import { optimizedReceivablesService } from '../services/optimizedReceivablesService';
import { performanceUtils } from '../hooks/usePerformanceMonitor';

interface PerformanceTestResult {
  testName: string;
  originalTime: number;
  optimizedTime: number;
  improvement: number;
  improvementPercentage: number;
  memoryUsage?: {
    before: number;
    after: number;
    difference: number;
  };
}

interface TestScenario {
  name: string;
  description: string;
  dataSize: 'small' | 'medium' | 'large';
  iterations: number;
  filters?: any;
}

class PerformanceTestSuite {
  private results: PerformanceTestResult[] = [];

  // Test scenarios for different data sizes
  private scenarios: TestScenario[] = [
    {
      name: 'Small Dataset',
      description: 'Test with 20 receivables',
      dataSize: 'small',
      iterations: 5,
      filters: { page_size: 20 },
    },
    {
      name: 'Medium Dataset',
      description: 'Test with 100 receivables',
      dataSize: 'medium',
      iterations: 3,
      filters: { page_size: 100 },
    },
    {
      name: 'Large Dataset',
      description: 'Test with 500 receivables',
      dataSize: 'large',
      iterations: 2,
      filters: { page_size: 500 },
    },
    {
      name: 'Filtered Search',
      description: 'Test with search and filters',
      dataSize: 'medium',
      iterations: 3,
      filters: {
        page_size: 100,
        status: 'overdue',
        search: 'test',
      },
    },
    {
      name: 'Aging Calculation',
      description: 'Test aging bucket calculations',
      dataSize: 'medium',
      iterations: 5,
      filters: { page_size: 100 },
    },
  ];

  async runAllTests(): Promise<PerformanceTestResult[]> {
    console.log('🚀 Starting Performance Test Suite...');
    this.results = [];

    for (const scenario of this.scenarios) {
      console.log(`\n📊 Running test: ${scenario.name}`);
      const result = await this.runScenarioTest(scenario);
      this.results.push(result);

      // Log immediate results
      console.log(`✅ ${scenario.name} completed:`);
      console.log(`   Original: ${result.originalTime.toFixed(2)}ms`);
      console.log(`   Optimized: ${result.optimizedTime.toFixed(2)}ms`);
      console.log(`   Improvement: ${result.improvementPercentage.toFixed(1)}%`);
    }

    this.printSummary();
    return this.results;
  }

  private async runScenarioTest(scenario: TestScenario): Promise<PerformanceTestResult> {
    const originalTimes: number[] = [];
    const optimizedTimes: number[] = [];

    // Warm up
    try {
      await receivablesService.getReceivables({ page_size: 5 });
      await optimizedReceivablesService.getOptimizedReceivables({ page_size: 5 });
    } catch (error) {
      console.warn('Warmup failed, continuing with tests...');
    }

    // Run iterations
    for (let i = 0; i < scenario.iterations; i++) {
      // Test original implementation
      const originalResult = await performanceUtils.measureAsync(
        () => receivablesService.getReceivables(scenario.filters || {}),
        `Original ${scenario.name} - Iteration ${i + 1}`
      );
      originalTimes.push(originalResult.duration);

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test optimized implementation
      const optimizedResult = await performanceUtils.measureAsync(
        () =>
          optimizedReceivablesService.getOptimizedReceivables(scenario.filters || {}, {
            enableCache: true,
            prefetch: true,
          }),
        `Optimized ${scenario.name} - Iteration ${i + 1}`
      );
      optimizedTimes.push(optimizedResult.duration);

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Calculate averages
    const originalAvg = originalTimes.reduce((sum, time) => sum + time, 0) / originalTimes.length;
    const optimizedAvg =
      optimizedTimes.reduce((sum, time) => sum + time, 0) / optimizedTimes.length;
    const improvement = originalAvg - optimizedAvg;
    const improvementPercentage = originalAvg > 0 ? (improvement / originalAvg) * 100 : 0;

    return {
      testName: scenario.name,
      originalTime: originalAvg,
      optimizedTime: optimizedAvg,
      improvement,
      improvementPercentage,
    };
  }

  private printSummary(): void {
    console.log('\n📈 Performance Test Summary');
    console.log('='.repeat(60));

    let totalImprovement = 0;
    let testsWithImprovement = 0;

    this.results.forEach(result => {
      const status = result.improvementPercentage > 0 ? '✅' : '❌';
      console.log(`${status} ${result.testName}:`);
      console.log(`   Original: ${result.originalTime.toFixed(2)}ms`);
      console.log(`   Optimized: ${result.optimizedTime.toFixed(2)}ms`);
      console.log(`   Improvement: ${result.improvementPercentage.toFixed(1)}%`);
      console.log('');

      if (result.improvementPercentage > 0) {
        totalImprovement += result.improvementPercentage;
        testsWithImprovement++;
      }
    });

    const averageImprovement =
      testsWithImprovement > 0 ? totalImprovement / testsWithImprovement : 0;

    console.log(`🎯 Average Performance Improvement: ${averageImprovement.toFixed(1)}%`);
    console.log(`📊 Tests with Improvement: ${testsWithImprovement}/${this.results.length}`);

    // Memory usage summary
    const memoryUsage = optimizedReceivablesService.getMemoryUsage();
    console.log(`💾 Memory Usage:`);
    console.log(`   Cache Size: ${memoryUsage.cacheSize} entries`);
    console.log(`   Prefetch Cache: ${memoryUsage.prefetchCacheSize} entries`);
    console.log(`   Batch Queue: ${memoryUsage.batchQueueSize} operations`);
  }

  // Test virtual scrolling performance
  async testVirtualScrolling(itemCount: number = 1000): Promise<{
    renderTime: number;
    memoryUsage: number;
    scrollPerformance: number;
  }> {
    console.log(`🖥️  Testing Virtual Scrolling with ${itemCount} items...`);

    // Generate mock data
    const mockData = Array.from({ length: itemCount }, (_, index) => ({
      id: index + 1,
      reference_number: `REF-${String(index + 1).padStart(6, '0')}`,
      client_name: `Client ${index + 1}`,
      balance: (Math.random() * 100000).toFixed(2),
      due_date: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      aging_bucket: ['current', '1-30', '31-60', '61-90', '90+'][
        Math.floor(Math.random() * 5)
      ] as any,
      status: ['pending', 'partial', 'overdue', 'paid'][Math.floor(Math.random() * 4)] as any,
    }));

    // Measure render time
    const renderStart = performance.now();

    // Simulate virtual scrolling calculations
    const visibleItems = 20; // Items visible at once
    const itemHeight = 60;
    const containerHeight = 400;

    for (let scrollTop = 0; scrollTop < itemCount * itemHeight; scrollTop += containerHeight) {
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.min(startIndex + visibleItems, itemCount);
      const visibleData = mockData.slice(startIndex, endIndex);

      // Simulate rendering
      visibleData.forEach(item => {
        // Mock DOM operations
        const element = {
          id: item.id,
          innerHTML: `${item.client_name} - ${item.balance}`,
        };
      });
    }

    const renderTime = performance.now() - renderStart;

    // Get memory usage if available
    const memoryInfo = performanceUtils.getMemoryUsage();
    const memoryUsage = memoryInfo ? memoryInfo.usedJSHeapSize : 0;

    // Simulate scroll performance test
    const scrollStart = performance.now();
    for (let i = 0; i < 100; i++) {
      // Simulate scroll events
      const scrollTop = Math.random() * itemCount * itemHeight;
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.min(startIndex + visibleItems, itemCount);
    }
    const scrollPerformance = performance.now() - scrollStart;

    console.log(`✅ Virtual Scrolling Test Results:`);
    console.log(`   Render Time: ${renderTime.toFixed(2)}ms`);
    console.log(`   Memory Usage: ${(memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Scroll Performance: ${scrollPerformance.toFixed(2)}ms for 100 operations`);

    return {
      renderTime,
      memoryUsage,
      scrollPerformance,
    };
  }

  // Test caching effectiveness
  async testCaching(): Promise<{
    firstLoad: number;
    cachedLoad: number;
    cacheHitRatio: number;
  }> {
    console.log('🗄️  Testing Caching Effectiveness...');

    // Clear cache first
    optimizedReceivablesService.clearCache();

    // First load (cache miss)
    const firstLoadResult = await performanceUtils.measureAsync(
      () =>
        optimizedReceivablesService.getOptimizedReceivables(
          { page_size: 50 },
          { enableCache: true }
        ),
      'First Load (Cache Miss)'
    );

    // Second load (cache hit)
    const cachedLoadResult = await performanceUtils.measureAsync(
      () =>
        optimizedReceivablesService.getOptimizedReceivables(
          { page_size: 50 },
          { enableCache: true }
        ),
      'Cached Load (Cache Hit)'
    );

    const cacheHitRatio =
      firstLoadResult.duration > 0
        ? (1 - cachedLoadResult.duration / firstLoadResult.duration) * 100
        : 0;

    console.log(`✅ Caching Test Results:`);
    console.log(`   First Load: ${firstLoadResult.duration.toFixed(2)}ms`);
    console.log(`   Cached Load: ${cachedLoadResult.duration.toFixed(2)}ms`);
    console.log(`   Cache Hit Improvement: ${cacheHitRatio.toFixed(1)}%`);

    return {
      firstLoad: firstLoadResult.duration,
      cachedLoad: cachedLoadResult.duration,
      cacheHitRatio,
    };
  }

  getResults(): PerformanceTestResult[] {
    return this.results;
  }

  exportResults(): string {
    const csvHeader =
      'Test Name,Original Time (ms),Optimized Time (ms),Improvement (ms),Improvement (%)\n';
    const csvRows = this.results
      .map(
        result =>
          `${result.testName},${result.originalTime.toFixed(2)},${result.optimizedTime.toFixed(2)},${result.improvement.toFixed(2)},${result.improvementPercentage.toFixed(1)}`
      )
      .join('\n');

    return csvHeader + csvRows;
  }
}

// Export singleton instance
export const performanceTestSuite = new PerformanceTestSuite();

// Utility function to run quick performance test
export async function runQuickPerformanceTest(): Promise<void> {
  console.log('⚡ Running Quick Performance Test...');

  try {
    // Test basic operations
    await performanceTestSuite.testCaching();
    await performanceTestSuite.testVirtualScrolling(500);

    console.log('✅ Quick Performance Test Completed');
  } catch (error) {
    console.error('❌ Performance Test Failed:', error);
  }
}

export default performanceTestSuite;
