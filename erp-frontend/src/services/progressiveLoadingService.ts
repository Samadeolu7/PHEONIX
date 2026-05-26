// Progressive loading service for large datasets and dashboard optimization
import { StatsCardData } from '../components/dashboard/StatsCard';
import { ActivityItem } from '../components/dashboard/ActivityFeed';
import { UserRole } from '../types/roles';
import { PageId } from '../types/permissions';
import { dashboardCacheService } from './dashboardCacheService';
import { statsPerformanceMonitor } from './statsPerformanceMonitor';

export interface ProgressiveLoadingConfig {
  chunkSize: number;
  loadingDelay: number;
  maxConcurrentRequests: number;
  enableCaching: boolean;
  enableCompression: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export interface LoadingProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  estimatedTimeRemaining: number;
  loadingSpeed: number; // items per second
}

export interface ProgressiveLoadingResult<T> {
  data: T[];
  progress: LoadingProgress;
  isComplete: boolean;
  error?: Error;
  metadata: {
    totalLoadTime: number;
    cacheHits: number;
    cacheMisses: number;
    networkRequests: number;
    compressionRatio: number;
  };
}

export interface DataChunk<T> {
  id: string;
  data: T[];
  index: number;
  size: number;
  loadTime: number;
  fromCache: boolean;
  compressed: boolean;
}

export interface LoadingStrategy {
  name: string;
  description: string;
  chunkSize: number;
  loadingPattern: 'sequential' | 'parallel' | 'adaptive';
  priorityFunction?: (index: number, total: number) => number;
}

const DEFAULT_CONFIG: ProgressiveLoadingConfig = {
  chunkSize: 20,
  loadingDelay: 100,
  maxConcurrentRequests: 3,
  enableCaching: true,
  enableCompression: true,
  retryAttempts: 3,
  retryDelay: 1000,
};

const LOADING_STRATEGIES: Record<string, LoadingStrategy> = {
  sequential: {
    name: 'Sequential',
    description: 'Load chunks one by one in order',
    chunkSize: 15,
    loadingPattern: 'sequential',
  },
  parallel: {
    name: 'Parallel',
    description: 'Load multiple chunks simultaneously',
    chunkSize: 10,
    loadingPattern: 'parallel',
  },
  adaptive: {
    name: 'Adaptive',
    description: 'Adjust loading based on network conditions',
    chunkSize: 20,
    loadingPattern: 'adaptive',
    priorityFunction: (index, total) => {
      // Prioritize first and last chunks
      if (index === 0) return 10;
      if (index === total - 1) return 9;
      return Math.max(1, 8 - index);
    },
  },
  priority: {
    name: 'Priority-based',
    description: 'Load most important data first',
    chunkSize: 12,
    loadingPattern: 'parallel',
    priorityFunction: (index, total) => total - index,
  },
};

export class ProgressiveLoadingService {
  private config: ProgressiveLoadingConfig;
  private activeLoaders = new Map<string, AbortController>();
  private loadingStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalLoadTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(config: Partial<ProgressiveLoadingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Main progressive loading method
  async loadProgressively<T>(
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    options: {
      strategy?: keyof typeof LOADING_STRATEGIES;
      onProgress?: (progress: LoadingProgress) => void;
      onChunkLoaded?: (chunk: DataChunk<T>) => void;
      onError?: (error: Error, chunkIndex: number) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<ProgressiveLoadingResult<T>> {
    const { strategy = 'adaptive', onProgress, onChunkLoaded, onError, signal } = options;

    const startTime = Date.now();
    const loadingStrategy = LOADING_STRATEGIES[strategy];
    const abortController = new AbortController();

    // Combine external signal with internal controller
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort());
    }

    this.activeLoaders.set(loaderId, abortController);

    try {
      // Get total count first
      const initialLoad = await dataLoader(0, 1);
      const totalItems = initialLoad.total;
      const chunkSize = this.determineOptimalChunkSize(loadingStrategy.chunkSize, totalItems);
      const totalChunks = Math.ceil(totalItems / chunkSize);

      let loadedData: T[] = [];
      let loadedCount = 0;
      let networkRequests = 0;
      let cacheHits = 0;
      let cacheMisses = 0;
      let compressionRatio = 0;

      const progress: LoadingProgress = {
        loaded: 0,
        total: totalItems,
        percentage: 0,
        currentChunk: 0,
        totalChunks,
        estimatedTimeRemaining: 0,
        loadingSpeed: 0,
      };

      // Load chunks based on strategy
      const chunks = await this.loadChunks(
        loaderId,
        dataLoader,
        totalChunks,
        chunkSize,
        loadingStrategy,
        {
          onProgress: chunkProgress => {
            progress.loaded = chunkProgress.loaded;
            progress.percentage = (chunkProgress.loaded / totalItems) * 100;
            progress.currentChunk = chunkProgress.currentChunk;
            progress.estimatedTimeRemaining = chunkProgress.estimatedTimeRemaining;
            progress.loadingSpeed = chunkProgress.loadingSpeed;

            if (onProgress) {
              onProgress(progress);
            }
          },
          onChunkLoaded: chunk => {
            loadedData.push(...chunk.data);
            loadedCount += chunk.data.length;

            if (chunk.fromCache) {
              cacheHits++;
            } else {
              cacheMisses++;
              networkRequests++;
            }

            if (chunk.compressed) {
              compressionRatio += 0.3; // Approximate compression benefit
            }

            if (onChunkLoaded) {
              onChunkLoaded(chunk);
            }
          },
          onError,
          signal: abortController.signal,
        }
      );

      const totalLoadTime = Date.now() - startTime;

      // Update statistics
      this.loadingStats.totalRequests++;
      this.loadingStats.successfulRequests++;
      this.loadingStats.totalLoadTime += totalLoadTime;
      this.loadingStats.cacheHits += cacheHits;
      this.loadingStats.cacheMisses += cacheMisses;

      // Record performance metrics
      statsPerformanceMonitor.recordStatsLoad(
        'Officer', // Default role
        [loaderId],
        loadedData.length,
        totalLoadTime,
        true
      );

      return {
        data: loadedData,
        progress: {
          ...progress,
          loaded: loadedCount,
          percentage: 100,
        },
        isComplete: true,
        metadata: {
          totalLoadTime,
          cacheHits,
          cacheMisses,
          networkRequests,
          compressionRatio: compressionRatio / totalChunks,
        },
      };
    } catch (error) {
      this.loadingStats.failedRequests++;

      const totalLoadTime = Date.now() - startTime;
      statsPerformanceMonitor.recordStatsLoad(
        'Officer',
        [loaderId],
        0,
        totalLoadTime,
        false,
        error instanceof Error ? error.message : 'Unknown error'
      );

      return {
        data: [],
        progress: {
          loaded: 0,
          total: 0,
          percentage: 0,
          currentChunk: 0,
          totalChunks: 0,
          estimatedTimeRemaining: 0,
          loadingSpeed: 0,
        },
        isComplete: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metadata: {
          totalLoadTime,
          cacheHits: 0,
          cacheMisses: 0,
          networkRequests: 0,
          compressionRatio: 0,
        },
      };
    } finally {
      this.activeLoaders.delete(loaderId);
    }
  }

  // Load chunks based on strategy
  private async loadChunks<T>(
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    totalChunks: number,
    chunkSize: number,
    strategy: LoadingStrategy,
    callbacks: {
      onProgress: (progress: {
        loaded: number;
        currentChunk: number;
        estimatedTimeRemaining: number;
        loadingSpeed: number;
      }) => void;
      onChunkLoaded: (chunk: DataChunk<T>) => void;
      onError?: (error: Error, chunkIndex: number) => void;
      signal: AbortSignal;
    }
  ): Promise<DataChunk<T>[]> {
    const chunks: DataChunk<T>[] = [];
    const chunkLoadTimes: number[] = [];
    let loadedCount = 0;

    switch (strategy.loadingPattern) {
      case 'sequential':
        return this.loadSequentially(loaderId, dataLoader, totalChunks, chunkSize, callbacks);

      case 'parallel':
        return this.loadInParallel(loaderId, dataLoader, totalChunks, chunkSize, callbacks);

      case 'adaptive':
        return this.loadAdaptively(
          loaderId,
          dataLoader,
          totalChunks,
          chunkSize,
          strategy,
          callbacks
        );

      default:
        return this.loadSequentially(loaderId, dataLoader, totalChunks, chunkSize, callbacks);
    }
  }

  // Sequential loading
  private async loadSequentially<T>(
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    totalChunks: number,
    chunkSize: number,
    callbacks: {
      onProgress: (progress: {
        loaded: number;
        currentChunk: number;
        estimatedTimeRemaining: number;
        loadingSpeed: number;
      }) => void;
      onChunkLoaded: (chunk: DataChunk<T>) => void;
      onError?: (error: Error, chunkIndex: number) => void;
      signal: AbortSignal;
    }
  ): Promise<DataChunk<T>[]> {
    const chunks: DataChunk<T>[] = [];
    const loadTimes: number[] = [];
    let loadedCount = 0;

    for (let i = 0; i < totalChunks; i++) {
      if (callbacks.signal.aborted) {
        throw new Error('Loading aborted');
      }

      const startTime = Date.now();

      try {
        const chunk = await this.loadChunk(loaderId, dataLoader, i, chunkSize);
        const loadTime = Date.now() - startTime;

        chunk.loadTime = loadTime;
        chunks.push(chunk);
        loadTimes.push(loadTime);
        loadedCount += chunk.data.length;

        // Calculate progress
        const avgLoadTime = loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
        const remainingChunks = totalChunks - i - 1;
        const estimatedTimeRemaining = remainingChunks * avgLoadTime;
        const loadingSpeed =
          loadedCount /
          ((Date.now() - (Date.now() - loadTimes.reduce((sum, time) => sum + time, 0))) / 1000);

        callbacks.onProgress({
          loaded: loadedCount,
          currentChunk: i + 1,
          estimatedTimeRemaining,
          loadingSpeed,
        });

        callbacks.onChunkLoaded(chunk);

        // Add delay between chunks if configured
        if (this.config.loadingDelay > 0 && i < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.loadingDelay));
        }
      } catch (error) {
        if (callbacks.onError) {
          callbacks.onError(error instanceof Error ? error : new Error('Unknown error'), i);
        }

        // Continue with next chunk unless it's a critical error
        if (error instanceof Error && error.message.includes('abort')) {
          throw error;
        }
      }
    }

    return chunks;
  }

  // Parallel loading
  private async loadInParallel<T>(
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    totalChunks: number,
    chunkSize: number,
    callbacks: {
      onProgress: (progress: {
        loaded: number;
        currentChunk: number;
        estimatedTimeRemaining: number;
        loadingSpeed: number;
      }) => void;
      onChunkLoaded: (chunk: DataChunk<T>) => void;
      onError?: (error: Error, chunkIndex: number) => void;
      signal: AbortSignal;
    }
  ): Promise<DataChunk<T>[]> {
    const chunks: DataChunk<T>[] = new Array(totalChunks);
    const promises: Promise<void>[] = [];
    let completedChunks = 0;
    let loadedCount = 0;
    const startTime = Date.now();

    // Create semaphore for concurrent requests
    const semaphore = new Array(this.config.maxConcurrentRequests).fill(null);
    let semaphoreIndex = 0;

    for (let i = 0; i < totalChunks; i++) {
      const promise = this.loadChunkWithSemaphore(
        semaphore,
        semaphoreIndex,
        loaderId,
        dataLoader,
        i,
        chunkSize
      )
        .then(chunk => {
          chunks[i] = chunk;
          completedChunks++;
          loadedCount += chunk.data.length;

          // Calculate progress
          const elapsedTime = Date.now() - startTime;
          const avgTimePerChunk = elapsedTime / completedChunks;
          const remainingChunks = totalChunks - completedChunks;
          const estimatedTimeRemaining = remainingChunks * avgTimePerChunk;
          const loadingSpeed = loadedCount / (elapsedTime / 1000);

          callbacks.onProgress({
            loaded: loadedCount,
            currentChunk: completedChunks,
            estimatedTimeRemaining,
            loadingSpeed,
          });

          callbacks.onChunkLoaded(chunk);
        })
        .catch(error => {
          if (callbacks.onError) {
            callbacks.onError(error instanceof Error ? error : new Error('Unknown error'), i);
          }
        });

      promises.push(promise);
      semaphoreIndex = (semaphoreIndex + 1) % this.config.maxConcurrentRequests;
    }

    await Promise.allSettled(promises);
    return chunks.filter(chunk => chunk !== undefined);
  }

  // Adaptive loading
  private async loadAdaptively<T>(
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    totalChunks: number,
    chunkSize: number,
    strategy: LoadingStrategy,
    callbacks: {
      onProgress: (progress: {
        loaded: number;
        currentChunk: number;
        estimatedTimeRemaining: number;
        loadingSpeed: number;
      }) => void;
      onChunkLoaded: (chunk: DataChunk<T>) => void;
      onError?: (error: Error, chunkIndex: number) => void;
      signal: AbortSignal;
    }
  ): Promise<DataChunk<T>[]> {
    // Start with parallel loading but adjust based on performance
    const chunks: DataChunk<T>[] = [];
    const loadTimes: number[] = [];
    let currentConcurrency = Math.min(3, this.config.maxConcurrentRequests);
    let loadedCount = 0;

    // Create priority queue if priority function exists
    const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
    if (strategy.priorityFunction) {
      chunkIndices.sort(
        (a, b) =>
          (strategy.priorityFunction!(b, totalChunks) || 0) -
          (strategy.priorityFunction!(a, totalChunks) || 0)
      );
    }

    let processedChunks = 0;
    const startTime = Date.now();

    while (processedChunks < totalChunks) {
      if (callbacks.signal.aborted) {
        throw new Error('Loading aborted');
      }

      // Load next batch
      const batchSize = Math.min(currentConcurrency, totalChunks - processedChunks);
      const batchIndices = chunkIndices.slice(processedChunks, processedChunks + batchSize);

      const batchPromises = batchIndices.map(async chunkIndex => {
        const chunkStartTime = Date.now();
        try {
          const chunk = await this.loadChunk(loaderId, dataLoader, chunkIndex, chunkSize);
          const loadTime = Date.now() - chunkStartTime;
          chunk.loadTime = loadTime;
          loadTimes.push(loadTime);
          return chunk;
        } catch (error) {
          if (callbacks.onError) {
            callbacks.onError(
              error instanceof Error ? error : new Error('Unknown error'),
              chunkIndex
            );
          }
          return null;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          chunks.push(result.value);
          loadedCount += result.value.data.length;
          callbacks.onChunkLoaded(result.value);
        }
      });

      processedChunks += batchSize;

      // Adapt concurrency based on performance
      if (loadTimes.length >= 3) {
        const avgLoadTime = loadTimes.slice(-3).reduce((sum, time) => sum + time, 0) / 3;

        if (avgLoadTime > 2000) {
          // If chunks are taking too long
          currentConcurrency = Math.max(1, currentConcurrency - 1);
        } else if (avgLoadTime < 500) {
          // If chunks are loading quickly
          currentConcurrency = Math.min(this.config.maxConcurrentRequests, currentConcurrency + 1);
        }
      }

      // Update progress
      const elapsedTime = Date.now() - startTime;
      const avgTimePerChunk = elapsedTime / processedChunks;
      const remainingChunks = totalChunks - processedChunks;
      const estimatedTimeRemaining = remainingChunks * avgTimePerChunk;
      const loadingSpeed = loadedCount / (elapsedTime / 1000);

      callbacks.onProgress({
        loaded: loadedCount,
        currentChunk: processedChunks,
        estimatedTimeRemaining,
        loadingSpeed,
      });
    }

    return chunks;
  }

  // Load individual chunk with caching
  private async loadChunk<T>(
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    chunkIndex: number,
    chunkSize: number
  ): Promise<DataChunk<T>> {
    const offset = chunkIndex * chunkSize;
    const cacheKey = `${loaderId}-chunk-${chunkIndex}`;

    // Check cache first
    if (this.config.enableCaching) {
      const cached = dashboardCacheService.get<T[]>(cacheKey);
      if (cached) {
        return {
          id: cacheKey,
          data: cached,
          index: chunkIndex,
          size: cached.length,
          loadTime: 0,
          fromCache: true,
          compressed: false,
        };
      }
    }

    // Load from network
    const result = await dataLoader(offset, chunkSize);

    // Cache the result
    if (this.config.enableCaching) {
      dashboardCacheService.set(cacheKey, result.data, {
        ttl: 5 * 60 * 1000, // 5 minutes
        tags: [loaderId, 'chunk'],
        priority: 5,
      });
    }

    return {
      id: cacheKey,
      data: result.data,
      index: chunkIndex,
      size: result.data.length,
      loadTime: 0, // Will be set by caller
      fromCache: false,
      compressed: this.config.enableCompression,
    };
  }

  // Semaphore-based loading for concurrency control
  private async loadChunkWithSemaphore<T>(
    semaphore: any[],
    index: number,
    loaderId: string,
    dataLoader: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>,
    chunkIndex: number,
    chunkSize: number
  ): Promise<DataChunk<T>> {
    // Wait for semaphore slot
    while (semaphore[index] !== null) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    semaphore[index] = true;

    try {
      return await this.loadChunk(loaderId, dataLoader, chunkIndex, chunkSize);
    } finally {
      semaphore[index] = null;
    }
  }

  // Determine optimal chunk size based on data size and device capabilities
  private determineOptimalChunkSize(baseChunkSize: number, totalItems: number): number {
    // Adjust based on total items
    if (totalItems < 50) return Math.min(baseChunkSize, totalItems);
    if (totalItems > 10000) return Math.max(baseChunkSize, 50);

    // Adjust based on device capabilities
    const deviceMemory = (navigator as any).deviceMemory || 4; // GB
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;

    let adjustedSize = baseChunkSize;

    if (deviceMemory >= 8) {
      adjustedSize = Math.floor(baseChunkSize * 1.5);
    } else if (deviceMemory <= 2) {
      adjustedSize = Math.floor(baseChunkSize * 0.7);
    }

    if (hardwareConcurrency >= 8) {
      adjustedSize = Math.floor(adjustedSize * 1.2);
    } else if (hardwareConcurrency <= 2) {
      adjustedSize = Math.floor(adjustedSize * 0.8);
    }

    return Math.max(5, Math.min(100, adjustedSize));
  }

  // Cancel loading
  cancelLoading(loaderId: string): boolean {
    const controller = this.activeLoaders.get(loaderId);
    if (controller) {
      controller.abort();
      this.activeLoaders.delete(loaderId);
      return true;
    }
    return false;
  }

  // Get loading statistics
  getLoadingStats() {
    const totalRequests = this.loadingStats.totalRequests;
    return {
      ...this.loadingStats,
      successRate:
        totalRequests > 0 ? (this.loadingStats.successfulRequests / totalRequests) * 100 : 0,
      averageLoadTime: totalRequests > 0 ? this.loadingStats.totalLoadTime / totalRequests : 0,
      cacheHitRate:
        this.loadingStats.cacheHits + this.loadingStats.cacheMisses > 0
          ? (this.loadingStats.cacheHits /
              (this.loadingStats.cacheHits + this.loadingStats.cacheMisses)) *
            100
          : 0,
    };
  }

  // Update configuration
  updateConfig(updates: Partial<ProgressiveLoadingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Get available strategies
  getAvailableStrategies(): LoadingStrategy[] {
    return Object.values(LOADING_STRATEGIES);
  }

  // Reset statistics
  resetStats(): void {
    this.loadingStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLoadTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }
}

// Export singleton instance
export const progressiveLoadingService = new ProgressiveLoadingService();

export default progressiveLoadingService;
