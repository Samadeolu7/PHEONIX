// src/hooks/useDataCache.ts
import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  staleWhileRevalidate?: boolean; // Return stale data while fetching fresh data
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder: string[] = [];
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  set<T>(key: string, data: T, ttl = 5 * 60 * 1000): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    };

    // Remove from access order if it exists
    const existingIndex = this.accessOrder.indexOf(key);
    if (existingIndex > -1) {
      this.accessOrder.splice(existingIndex, 1);
    }

    // Add to front of access order
    this.accessOrder.unshift(key);

    // Set the entry
    this.cache.set(key, entry);

    // Evict oldest entries if over max size
    while (this.accessOrder.length > this.maxSize) {
      const oldestKey = this.accessOrder.pop();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      return null;
    }

    // Move to front of access order
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.unshift(key);
    }

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      return false;
    }

    return true;
  }

  isStale(key: string, maxAge: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;

    const now = Date.now();
    return now - entry.timestamp > maxAge;
  }

  delete(key: string): void {
    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance
const globalCache = new DataCache(200);

export function useDataCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
) {
  const {
    ttl = 5 * 60 * 1000, // 5 minutes default
    staleWhileRevalidate = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  const fetcherRef = useRef(fetcher);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update fetcher ref when it changes
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Check cache first
      const cachedData = globalCache.get<T>(key);
      const hasCache = globalCache.has(key);
      const cacheIsStale = globalCache.isStale(key, ttl * 0.8); // Consider stale at 80% of TTL

      if (hasCache && !forceRefresh) {
        setData(cachedData);
        setError(null);
        setIsStale(cacheIsStale);

        // If stale and staleWhileRevalidate is enabled, fetch in background
        if (cacheIsStale && staleWhileRevalidate) {
          // Don't set loading state for background refresh
          try {
            const freshData = await fetcherRef.current();
            globalCache.set(key, freshData, ttl);
            setData(freshData);
            setIsStale(false);
          } catch (err) {
            // Keep using stale data if background refresh fails
            console.warn('Background refresh failed:', err);
          }
        }

        return;
      }

      // No cache or force refresh - fetch fresh data
      setLoading(true);
      setError(null);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const freshData = await fetcherRef.current();

        if (!abortController.signal.aborted) {
          globalCache.set(key, freshData, ttl);
          setData(freshData);
          setIsStale(false);
          setError(null);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
          setError(errorMessage);

          // If we have stale data, keep using it
          if (cachedData) {
            setData(cachedData);
            setIsStale(true);
          }
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
        abortControllerRef.current = null;
      }
    },
    [key, ttl, staleWhileRevalidate]
  );

  // Initial fetch
  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    globalCache.delete(key);
    return fetchData(true);
  }, [key, fetchData]);

  const mutate = useCallback(
    (newData: T) => {
      globalCache.set(key, newData, ttl);
      setData(newData);
      setIsStale(false);
      setError(null);
    },
    [key, ttl]
  );

  return {
    data,
    loading,
    error,
    isStale,
    refresh,
    invalidate,
    mutate,
  };
}

// Utility functions for cache management
export const cacheUtils = {
  clear: () => globalCache.clear(),
  delete: (key: string) => globalCache.delete(key),
  size: () => globalCache.size(),
  keys: () => globalCache.keys(),

  // Prefetch data
  prefetch: async <T>(key: string, fetcher: () => Promise<T>, ttl = 5 * 60 * 1000) => {
    if (!globalCache.has(key)) {
      try {
        const data = await fetcher();
        globalCache.set(key, data, ttl);
      } catch (error) {
        console.warn('Prefetch failed for key:', key, error);
      }
    }
  },

  // Batch invalidate
  invalidatePattern: (pattern: RegExp) => {
    const keys = globalCache.keys();
    keys.forEach(key => {
      if (pattern.test(key)) {
        globalCache.delete(key);
      }
    });
  },
};

export default useDataCache;
