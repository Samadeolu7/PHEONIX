// src/hooks/usePerformanceMonitor.ts
import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  componentName: string;
  timestamp: number;
  props?: Record<string, any>;
}

interface PerformanceMonitorOptions {
  enabled?: boolean;
  threshold?: number; // Log slow renders above this threshold (ms)
  logToConsole?: boolean;
  trackProps?: boolean;
}

class PerformanceTracker {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 100;

  addMetric(metric: PerformanceMetrics) {
    this.metrics.push(metric);

    // Keep only the last maxMetrics entries
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(componentName?: string): PerformanceMetrics[] {
    if (componentName) {
      return this.metrics.filter(m => m.componentName === componentName);
    }
    return [...this.metrics];
  }

  getAverageRenderTime(componentName: string): number {
    const componentMetrics = this.getMetrics(componentName);
    if (componentMetrics.length === 0) return 0;

    const total = componentMetrics.reduce((sum, m) => sum + m.renderTime, 0);
    return total / componentMetrics.length;
  }

  getSlowRenders(threshold = 16): PerformanceMetrics[] {
    return this.metrics.filter(m => m.renderTime > threshold);
  }

  clear() {
    this.metrics = [];
  }
}

const performanceTracker = new PerformanceTracker();

export function usePerformanceMonitor(
  componentName: string,
  options: PerformanceMonitorOptions = {}
) {
  const {
    enabled = process.env.NODE_ENV === 'development',
    threshold = 16, // 16ms = 60fps
    logToConsole = true,
    trackProps = false,
  } = options;

  const renderStartRef = useRef<number>();
  const propsRef = useRef<Record<string, any>>();

  // Start timing
  const startTiming = useCallback(() => {
    if (!enabled) return;
    renderStartRef.current = performance.now();
  }, [enabled]);

  // End timing and record metric
  const endTiming = useCallback(
    (props?: Record<string, any>) => {
      if (!enabled || !renderStartRef.current) return;

      const renderTime = performance.now() - renderStartRef.current;
      const metric: PerformanceMetrics = {
        renderTime,
        componentName,
        timestamp: Date.now(),
        props: trackProps ? props : undefined,
      };

      performanceTracker.addMetric(metric);

      // Log slow renders
      if (logToConsole && renderTime > threshold) {
        console.warn(
          `🐌 Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`,
          trackProps && props ? { props } : ''
        );
      }

      renderStartRef.current = undefined;
    },
    [enabled, componentName, threshold, logToConsole, trackProps]
  );

  // Track props changes
  useEffect(() => {
    if (trackProps) {
      propsRef.current = arguments[0] as Record<string, any>;
    }
  });

  // Auto-start timing on each render
  useEffect(() => {
    startTiming();

    return () => {
      endTiming(propsRef.current);
    };
  });

  return {
    startTiming,
    endTiming,
    getMetrics: () => performanceTracker.getMetrics(componentName),
    getAverageRenderTime: () => performanceTracker.getAverageRenderTime(componentName),
    clearMetrics: () => performanceTracker.clear(),
  };
}

// Higher-order component for performance monitoring
export function withPerformanceMonitor<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const ComponentWithPerformanceMonitor = (props: P) => {
    const name =
      componentName || WrappedComponent.displayName || WrappedComponent.name || 'Unknown';
    usePerformanceMonitor(name, { trackProps: true });

    return React.createElement(WrappedComponent, props);
  };

  ComponentWithPerformanceMonitor.displayName = `withPerformanceMonitor(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return ComponentWithPerformanceMonitor;
}

// Performance utilities
export const performanceUtils = {
  // Measure function execution time
  measureAsync: async <T>(
    fn: () => Promise<T>,
    label?: string
  ): Promise<{ result: T; duration: number }> => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (label) {
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  },

  measure: <T>(fn: () => T, label?: string): { result: T; duration: number } => {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    if (label) {
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  },

  // Get all performance metrics
  getAllMetrics: () => performanceTracker.getMetrics(),

  // Get slow renders across all components
  getSlowRenders: (threshold?: number) => performanceTracker.getSlowRenders(threshold),

  // Clear all metrics
  clearAllMetrics: () => performanceTracker.clear(),

  // Memory usage (if available)
  getMemoryUsage: () => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    }
    return null;
  },
};

export default usePerformanceMonitor;
