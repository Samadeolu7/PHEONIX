/**
 * Performance monitoring utilities for toast system
 * Helps track memory usage and prevent memory leaks
 */

interface ToastPerformanceMetrics {
  activeToasts: number;
  activeTimers: number;
  memoryUsage?: number;
  lastCleanup: number;
}

class ToastPerformanceMonitor {
  private metrics: ToastPerformanceMetrics = {
    activeToasts: 0,
    activeTimers: 0,
    lastCleanup: Date.now(),
  };

  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_TOASTS = 10;
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds

  constructor() {
    this.startPerformanceMonitoring();
  }

  /**
   * Start performance monitoring with periodic cleanup
   */
  private startPerformanceMonitoring(): void {
    // Only run in development mode
    if (process.env.NODE_ENV === 'development') {
      this.cleanupInterval = setInterval(() => {
        this.performCleanup();
      }, this.CLEANUP_INTERVAL);
    }
  }

  /**
   * Update metrics when toasts change
   */
  updateMetrics(activeToasts: number, activeTimers: number): void {
    this.metrics.activeToasts = activeToasts;
    this.metrics.activeTimers = activeTimers;

    // Get memory usage if available
    if (
      typeof window !== 'undefined' &&
      'performance' in window &&
      'memory' in (window.performance as any)
    ) {
      this.metrics.memoryUsage = (window.performance as any).memory?.usedJSHeapSize;
    }

    // Warn if too many toasts are active
    if (activeToasts > this.MAX_TOASTS) {
      console.warn(
        `Toast Performance Warning: ${activeToasts} active toasts detected. Consider limiting concurrent toasts.`
      );
    }

    // Warn if timer count doesn't match toast count
    if (activeTimers > activeToasts * 2) {
      console.warn(
        `Toast Performance Warning: Timer leak detected. ${activeTimers} timers for ${activeToasts} toasts.`
      );
    }
  }

  /**
   * Perform cleanup and log metrics
   */
  private performCleanup(): void {
    this.metrics.lastCleanup = Date.now();

    if (process.env.NODE_ENV === 'development') {
      console.log('Toast Performance Metrics:', {
        ...this.metrics,
        memoryUsage: this.metrics.memoryUsage
          ? `${Math.round(this.metrics.memoryUsage / 1024 / 1024)}MB`
          : 'N/A',
      });
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): ToastPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Cleanup monitoring when no longer needed
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
let performanceMonitor: ToastPerformanceMonitor | null = null;

/**
 * Get or create the performance monitor instance
 */
export const getToastPerformanceMonitor = (): ToastPerformanceMonitor => {
  if (!performanceMonitor) {
    performanceMonitor = new ToastPerformanceMonitor();
  }
  return performanceMonitor;
};

/**
 * Cleanup performance monitor
 */
export const cleanupToastPerformanceMonitor = (): void => {
  if (performanceMonitor) {
    performanceMonitor.destroy();
    performanceMonitor = null;
  }
};

/**
 * Hook for using toast performance monitoring
 */
export const useToastPerformanceMonitoring = (activeToasts: number, activeTimers: number): void => {
  const monitor = getToastPerformanceMonitor();

  React.useEffect(() => {
    monitor.updateMetrics(activeToasts, activeTimers);
  }, [monitor, activeToasts, activeTimers]);

  React.useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (activeToasts === 0 && activeTimers === 0) {
        cleanupToastPerformanceMonitor();
      }
    };
  }, [activeToasts, activeTimers]);
};

// Import React for the hook
import React from 'react';
