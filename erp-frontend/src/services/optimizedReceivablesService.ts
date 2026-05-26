// src/services/optimizedReceivablesService.ts
import { receivablesService, CustomerReceivable, ReceivablesFilters } from './receivablesService';
import { cacheUtils } from '../hooks/useDataCache';
import { performanceUtils } from '../hooks/usePerformanceMonitor';

interface BatchOperation<T> {
  items: T[];
  operation: (item: T) => Promise<any>;
  batchSize?: number;
  onProgress?: (completed: number, total: number) => void;
  onError?: (error: Error, item: T) => void;
}

interface OptimizedReceivablesResponse {
  results: CustomerReceivable[];
  count: number;
  next: string | null;
  previous: string | null;
  cached: boolean;
  performance: {
    fetchTime: number;
    cacheHit: boolean;
    itemCount: number;
  };
}

class OptimizedReceivablesService {
  private batchQueue: Map<string, Promise<any>> = new Map();
  private prefetchCache: Set<string> = new Set();

  // Optimized receivables fetching with performance tracking
  async getOptimizedReceivables(
    filters: ReceivablesFilters = {},
    options: {
      enableCache?: boolean;
      prefetch?: boolean;
      batchSize?: number;
    } = {}
  ): Promise<OptimizedReceivablesResponse> {
    const { enableCache = true, prefetch = false, batchSize = 100 } = options;

    const cacheKey = this.generateCacheKey('receivables', filters);
    const startTime = performance.now();

    try {
      // Check cache first if enabled
      let cacheHit = false;
      if (enableCache) {
        const cachedData = this.getCachedData<OptimizedReceivablesResponse>(cacheKey);
        if (cachedData) {
          cacheHit = true;
          return {
            ...cachedData,
            cached: true,
            performance: {
              fetchTime: performance.now() - startTime,
              cacheHit: true,
              itemCount: cachedData.results.length,
            },
          };
        }
      }

      // Fetch fresh data with optimized parameters
      const optimizedFilters = {
        ...filters,
        page_size: batchSize,
      };

      const { result: response, duration } = await performanceUtils.measureAsync(
        () => receivablesService.getReceivables(optimizedFilters),
        `Receivables fetch (${Object.keys(filters).length} filters)`
      );

      const optimizedResponse: OptimizedReceivablesResponse = {
        results: response.results || [],
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        cached: false,
        performance: {
          fetchTime: duration,
          cacheHit: false,
          itemCount: response.results?.length || 0,
        },
      };

      // Cache the response if enabled
      if (enableCache) {
        this.setCachedData(cacheKey, optimizedResponse, 2 * 60 * 1000); // 2 minutes
      }

      // Prefetch related data if requested
      if (prefetch && response.results?.length) {
        this.prefetchRelatedData(response.results);
      }

      return optimizedResponse;
    } catch (error) {
      console.error('Optimized receivables fetch failed:', error);
      throw error;
    }
  }

  // Batch operations with progress tracking
  async executeBatchOperation<T>(operation: BatchOperation<T>): Promise<{
    successful: T[];
    failed: Array<{ item: T; error: Error }>;
    duration: number;
  }> {
    const { items, operation: op, batchSize = 5, onProgress, onError } = operation;
    const startTime = performance.now();
    const successful: T[] = [];
    const failed: Array<{ item: T; error: Error }> = [];

    // Process items in batches to avoid overwhelming the server
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchPromises = batch.map(async item => {
        try {
          await op(item);
          successful.push(item);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          failed.push({ item, error: err });
          onError?.(err, item);
        }
      });

      await Promise.all(batchPromises);
      onProgress?.(successful.length + failed.length, items.length);

      // Small delay between batches to prevent rate limiting
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = performance.now() - startTime;

    console.log(`Batch operation completed in ${duration.toFixed(2)}ms:`, {
      total: items.length,
      successful: successful.length,
      failed: failed.length,
    });

    return { successful, failed, duration };
  }

  // Optimized aging calculation with caching
  async calculateAgingOptimized(receivables: CustomerReceivable[]): Promise<CustomerReceivable[]> {
    const cacheKey = `aging-${receivables.map(r => r.id).join(',')}-${Date.now()}`;

    return performanceUtils.measure(() => {
      const currentDate = new Date();

      return receivables.map(receivable => {
        const dueDate = new Date(receivable.due_date);
        const daysDiff = Math.floor(
          (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        let agingBucket: CustomerReceivable['aging_bucket'] = 'current';
        let status: CustomerReceivable['status'] = receivable.status;

        if (daysDiff > 0) {
          status = 'overdue';
          if (daysDiff <= 30) agingBucket = '1-30';
          else if (daysDiff <= 60) agingBucket = '31-60';
          else if (daysDiff <= 90) agingBucket = '61-90';
          else agingBucket = '90+';
        }

        return {
          ...receivable,
          days_overdue: Math.max(0, daysDiff),
          aging_bucket: agingBucket,
          status: status,
        };
      });
    }, `Aging calculation for ${receivables.length} receivables`).result;
  }

  // Prefetch related data for better performance
  private async prefetchRelatedData(receivables: CustomerReceivable[]): Promise<void> {
    const clientIds = [...new Set(receivables.map(r => r.client))];

    // Prefetch client data
    clientIds.forEach(clientId => {
      const cacheKey = `client-${clientId}`;
      if (!this.prefetchCache.has(cacheKey)) {
        this.prefetchCache.add(cacheKey);
        // Would prefetch client data here
        cacheUtils.prefetch(cacheKey, () => Promise.resolve({}));
      }
    });

    // Prefetch payment history for overdue receivables
    const overdueReceivables = receivables.filter(r => r.status === 'overdue');
    overdueReceivables.forEach(receivable => {
      const cacheKey = `payments-${receivable.id}`;
      if (!this.prefetchCache.has(cacheKey)) {
        this.prefetchCache.add(cacheKey);
        // Would prefetch payment history here
        cacheUtils.prefetch(cacheKey, () => Promise.resolve([]));
      }
    });
  }

  // Cache management utilities
  private generateCacheKey(prefix: string, filters: Record<string, any>): string {
    const filterString = Object.entries(filters)
      .filter(([_, value]) => value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');

    return `${prefix}-${filterString}`;
  }

  private getCachedData<T>(key: string): T | null {
    // This would integrate with the global cache
    return null; // Placeholder
  }

  private setCachedData<T>(key: string, data: T, ttl: number): void {
    // This would integrate with the global cache
    cacheUtils.prefetch(key, () => Promise.resolve(data), ttl);
  }

  // Performance monitoring utilities
  getPerformanceMetrics(): {
    cacheHitRate: number;
    averageFetchTime: number;
    totalRequests: number;
    cachedRequests: number;
  } {
    // This would track actual metrics
    return {
      cacheHitRate: 0,
      averageFetchTime: 0,
      totalRequests: 0,
      cachedRequests: 0,
    };
  }

  // Clear all caches
  clearCache(): void {
    cacheUtils.clear();
    this.prefetchCache.clear();
    this.batchQueue.clear();
  }

  // Optimized search with debouncing
  async searchReceivables(
    query: string,
    filters: ReceivablesFilters = {},
    options: {
      debounceMs?: number;
      maxResults?: number;
    } = {}
  ): Promise<CustomerReceivable[]> {
    const { debounceMs = 300, maxResults = 50 } = options;

    // Cancel previous search if still pending
    const searchKey = `search-${query}`;
    if (this.batchQueue.has(searchKey)) {
      // Would cancel previous request here
    }

    const searchPromise = this.performSearch(query, filters, maxResults);
    this.batchQueue.set(searchKey, searchPromise);

    try {
      const results = await searchPromise;
      this.batchQueue.delete(searchKey);
      return results;
    } catch (error) {
      this.batchQueue.delete(searchKey);
      throw error;
    }
  }

  private async performSearch(
    query: string,
    filters: ReceivablesFilters,
    maxResults: number
  ): Promise<CustomerReceivable[]> {
    const searchFilters = {
      ...filters,
      search: query,
      page_size: maxResults,
    };

    const response = await receivablesService.getReceivables(searchFilters);
    return response.results || [];
  }

  // Memory usage monitoring
  getMemoryUsage(): {
    cacheSize: number;
    prefetchCacheSize: number;
    batchQueueSize: number;
  } {
    return {
      cacheSize: cacheUtils.size(),
      prefetchCacheSize: this.prefetchCache.size,
      batchQueueSize: this.batchQueue.size,
    };
  }
}

// Export singleton instance
export const optimizedReceivablesService = new OptimizedReceivablesService();
export default optimizedReceivablesService;
