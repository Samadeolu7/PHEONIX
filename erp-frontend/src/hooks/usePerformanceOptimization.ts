// Performance optimization hook for dashboard components
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { statsPerformanceMonitor } from '../services/statsPerformanceMonitor';

export interface PerformanceConfig {
  enableLazyLoading: boolean;
  enableVirtualization: boolean;
  enableMemoization: boolean;
  enableProgressiveLoading: boolean;
  chunkSize: number;
  loadingDelay: number;
  cacheTimeout: number;
  maxConcurrentRequests: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  loadTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  componentCount: number;
  errorRate: number;
}

export interface OptimizationResult {
  isOptimized: boolean;
  metrics: PerformanceMetrics;
  suggestions: string[];
  config: PerformanceConfig;
}

const DEFAULT_CONFIG: PerformanceConfig = {
  enableLazyLoading: true,
  enableVirtualization: false,
  enableMemoization: true,
  enableProgressiveLoading: true,
  chunkSize: 10,
  loadingDelay: 100,
  cacheTimeout: 300000, // 5 minutes
  maxConcurrentRequests: 3,
};

export function usePerformanceOptimization(
  componentName: string,
  initialConfig: Partial<PerformanceConfig> = {}
) {
  const [config, setConfig] = useState<PerformanceConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    loadTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    componentCount: 0,
    errorRate: 0,
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const renderStartTime = useRef<number>(0);
  const loadStartTime = useRef<number>(0);
  const componentMountTime = useRef<number>(Date.now());
  const requestQueue = useRef<Array<() => Promise<any>>>([]);
  const activeRequests = useRef<number>(0);
  const performanceObserver = useRef<PerformanceObserver | null>(null);

  // Memoized performance config
  const optimizedConfig = useMemo(() => {
    return {
      ...config,
      // Auto-adjust based on device capabilities
      chunkSize: navigator.hardwareConcurrency
        ? Math.max(5, Math.min(20, navigator.hardwareConcurrency * 2))
        : config.chunkSize,
      maxConcurrentRequests:
        navigator.connection?.effectiveType === '4g'
          ? config.maxConcurrentRequests
          : Math.max(1, config.maxConcurrentRequests - 1),
    };
  }, [config]);

  // Performance monitoring setup
  useEffect(() => {
    if (typeof PerformanceObserver !== 'undefined') {
      performanceObserver.current = new PerformanceObserver(list => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name.includes(componentName)) {
            setMetrics(prev => ({
              ...prev,
              renderTime: entry.duration,
              loadTime: entry.responseEnd ? entry.responseEnd - entry.responseStart : 0,
            }));
          }
        });
      });

      performanceObserver.current.observe({
        entryTypes: ['measure', 'navigation', 'resource'],
      });
    }

    return () => {
      if (performanceObserver.current) {
        performanceObserver.current.disconnect();
      }
    };
  }, [componentName]);

  // Memory usage monitoring
  useEffect(() => {
    const updateMemoryUsage = () => {
      if (performance.memory) {
        setMetrics(prev => ({
          ...prev,
          memoryUsage: performance.memory.usedJSHeapSize,
        }));
      }
    };

    const interval = setInterval(updateMemoryUsage, 5000);
    return () => clearInterval(interval);
  }, []);

  // Start performance measurement
  const startMeasurement = useCallback(
    (type: 'render' | 'load') => {
      const now = performance.now();
      if (type === 'render') {
        renderStartTime.current = now;
      } else {
        loadStartTime.current = now;
      }

      performance.mark(`${componentName}-${type}-start`);
    },
    [componentName]
  );

  // End performance measurement
  const endMeasurement = useCallback(
    (type: 'render' | 'load') => {
      const now = performance.now();
      const startTime = type === 'render' ? renderStartTime.current : loadStartTime.current;
      const duration = now - startTime;

      performance.mark(`${componentName}-${type}-end`);
      performance.measure(
        `${componentName}-${type}`,
        `${componentName}-${type}-start`,
        `${componentName}-${type}-end`
      );

      setMetrics(prev => ({
        ...prev,
        [type === 'render' ? 'renderTime' : 'loadTime']: duration,
      }));

      // Record in performance monitor
      if (type === 'load') {
        statsPerformanceMonitor.recordStatsLoad(
          'Officer', // Default role, should be passed from context
          [componentName],
          1,
          duration,
          true
        );
      }

      return duration;
    },
    [componentName]
  );

  // Progressive data loading
  const loadDataProgressively = useCallback(
    async <T>(
      dataLoader: () => Promise<T[]>,
      onProgress?: (loaded: number, total: number) => void
    ): Promise<T[]> => {
      if (!config.enableProgressiveLoading) {
        return dataLoader();
      }

      startMeasurement('load');

      try {
        const allData = await dataLoader();
        const chunks: T[][] = [];

        // Split data into chunks
        for (let i = 0; i < allData.length; i += optimizedConfig.chunkSize) {
          chunks.push(allData.slice(i, i + optimizedConfig.chunkSize));
        }

        const loadedData: T[] = [];

        // Load chunks progressively
        for (let i = 0; i < chunks.length; i++) {
          await new Promise(resolve => setTimeout(resolve, config.loadingDelay));
          loadedData.push(...chunks[i]);

          if (onProgress) {
            onProgress(loadedData.length, allData.length);
          }
        }

        endMeasurement('load');
        return loadedData;
      } catch (error) {
        endMeasurement('load');
        throw error;
      }
    },
    [config, optimizedConfig, startMeasurement, endMeasurement]
  );

  // Request queue management
  const queueRequest = useCallback(
    async <T>(requestFn: () => Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const executeRequest = async () => {
          if (activeRequests.current >= optimizedConfig.maxConcurrentRequests) {
            // Queue the request
            requestQueue.current.push(executeRequest);
            return;
          }

          activeRequests.current++;

          try {
            const result = await requestFn();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            activeRequests.current--;

            // Process next request in queue
            const nextRequest = requestQueue.current.shift();
            if (nextRequest) {
              nextRequest();
            }
          }
        };

        executeRequest();
      });
    },
    [optimizedConfig.maxConcurrentRequests]
  );

  // Memoization helper
  const memoize = useCallback(
    <T extends (...args: any[]) => any>(fn: T, keyFn?: (...args: Parameters<T>) => string): T => {
      if (!config.enableMemoization) {
        return fn;
      }

      const cache = new Map<string, { result: ReturnType<T>; timestamp: number }>();

      return ((...args: Parameters<T>): ReturnType<T> => {
        const key = keyFn ? keyFn(...args) : JSON.stringify(args);
        const cached = cache.get(key);

        if (cached && Date.now() - cached.timestamp < config.cacheTimeout) {
          return cached.result;
        }

        const result = fn(...args);
        cache.set(key, { result, timestamp: Date.now() });

        // Clean up old cache entries
        if (cache.size > 100) {
          const oldestKey = cache.keys().next().value;
          cache.delete(oldestKey);
        }

        return result;
      }) as T;
    },
    [config.enableMemoization, config.cacheTimeout]
  );

  // Virtualization helper for large lists
  const virtualizeList = useCallback(
    <T>(items: T[], containerHeight: number, itemHeight: number, scrollTop: number = 0) => {
      if (!config.enableVirtualization) {
        return { visibleItems: items, startIndex: 0, endIndex: items.length - 1 };
      }

      const visibleCount = Math.ceil(containerHeight / itemHeight);
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.min(startIndex + visibleCount + 1, items.length - 1);

      const visibleItems = items.slice(startIndex, endIndex + 1);

      return { visibleItems, startIndex, endIndex };
    },
    [config.enableVirtualization]
  );

  // Performance analysis
  const analyzePerformance = useCallback((): OptimizationResult => {
    const currentMetrics = { ...metrics };
    const newSuggestions: string[] = [];

    // Analyze render time
    if (currentMetrics.renderTime > 100) {
      newSuggestions.push('Consider enabling virtualization for large lists');
      newSuggestions.push('Use React.memo for expensive components');
    }

    // Analyze load time
    if (currentMetrics.loadTime > 2000) {
      newSuggestions.push('Enable progressive loading for better perceived performance');
      newSuggestions.push('Implement request batching to reduce network overhead');
    }

    // Analyze memory usage
    if (currentMetrics.memoryUsage > 50 * 1024 * 1024) {
      // 50MB
      newSuggestions.push('Consider implementing data cleanup for unused components');
      newSuggestions.push('Enable memoization to reduce redundant calculations');
    }

    // Analyze cache performance
    if (currentMetrics.cacheHitRate < 70) {
      newSuggestions.push('Increase cache timeout for better hit rates');
      newSuggestions.push('Optimize cache key generation');
    }

    setSuggestions(newSuggestions);

    const isOptimized = newSuggestions.length === 0;

    return {
      isOptimized,
      metrics: currentMetrics,
      suggestions: newSuggestions,
      config: optimizedConfig,
    };
  }, [metrics, optimizedConfig]);

  // Auto-optimization
  const autoOptimize = useCallback(async () => {
    setIsOptimizing(true);

    try {
      const analysis = analyzePerformance();

      // Auto-apply optimizations based on analysis
      const newConfig = { ...config };

      if (analysis.metrics.renderTime > 100) {
        newConfig.enableVirtualization = true;
        newConfig.enableMemoization = true;
      }

      if (analysis.metrics.loadTime > 2000) {
        newConfig.enableProgressiveLoading = true;
        newConfig.chunkSize = Math.max(5, Math.floor(newConfig.chunkSize / 2));
      }

      if (analysis.metrics.memoryUsage > 50 * 1024 * 1024) {
        newConfig.cacheTimeout = Math.max(60000, newConfig.cacheTimeout / 2);
      }

      setConfig(newConfig);

      // Wait for changes to take effect
      await new Promise(resolve => setTimeout(resolve, 1000));

      return analyzePerformance();
    } finally {
      setIsOptimizing(false);
    }
  }, [config, analyzePerformance]);

  // Update configuration
  const updateConfig = useCallback((updates: Partial<PerformanceConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setMetrics({
      renderTime: 0,
      loadTime: 0,
      memoryUsage: 0,
      cacheHitRate: 0,
      componentCount: 0,
      errorRate: 0,
    });
    setSuggestions([]);
  }, []);

  // Get performance report
  const getPerformanceReport = useCallback(() => {
    const mountTime = Date.now() - componentMountTime.current;

    return {
      componentName,
      mountTime,
      metrics,
      config: optimizedConfig,
      suggestions,
      isOptimized: suggestions.length === 0,
      timestamp: new Date(),
    };
  }, [componentName, metrics, optimizedConfig, suggestions]);

  return {
    // Configuration
    config: optimizedConfig,
    updateConfig,

    // Metrics
    metrics,
    resetMetrics,

    // Measurement
    startMeasurement,
    endMeasurement,

    // Optimization utilities
    loadDataProgressively,
    queueRequest,
    memoize,
    virtualizeList,

    // Analysis and optimization
    analyzePerformance,
    autoOptimize,
    isOptimizing,
    suggestions,

    // Reporting
    getPerformanceReport,
  };
}

export default usePerformanceOptimization;
