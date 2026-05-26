// Advanced caching service for dashboard performance optimization
import { StatsCardData } from '../components/dashboard/StatsCard';
import { UserRole } from '../types/roles';
import { PageId } from '../types/permissions';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  size: number;
  tags: string[];
  priority: number;
}

export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  defaultTTL: number; // Default time to live in milliseconds
  maxEntries: number; // Maximum number of cache entries
  compressionEnabled: boolean;
  persistToStorage: boolean;
  storageKey: string;
}

export interface CacheStats {
  totalSize: number;
  totalEntries: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  compressionRatio: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  topAccessedKeys: Array<{ key: string; accessCount: number }>;
}

export interface CacheInvalidationRule {
  pattern: RegExp;
  tags: string[];
  maxAge: number;
  condition?: (entry: CacheEntry) => boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 100 * 1024 * 1024, // 100MB
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
  compressionEnabled: true,
  persistToStorage: true,
  storageKey: 'dashboard-cache',
};

export class DashboardCacheService {
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    compressionSaves: 0,
  };
  private invalidationRules: CacheInvalidationRule[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeCache();
    this.startCleanupInterval();
  }

  private initializeCache(): void {
    if (this.config.persistToStorage && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.config.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          Object.entries(parsed).forEach(([key, entry]: [string, any]) => {
            // Restore dates
            entry.timestamp = new Date(entry.timestamp);
            entry.expiresAt = new Date(entry.expiresAt);
            entry.lastAccessed = new Date(entry.lastAccessed);

            // Only restore non-expired entries
            if (entry.expiresAt > new Date()) {
              this.cache.set(key, entry);
            }
          });
        }
      } catch (error) {
        console.warn('Failed to restore cache from storage:', error);
      }
    }
  }

  private persistCache(): void {
    if (this.config.persistToStorage && typeof localStorage !== 'undefined') {
      try {
        const cacheObject = Object.fromEntries(this.cache.entries());
        localStorage.setItem(this.config.storageKey, JSON.stringify(cacheObject));
      } catch (error) {
        console.warn('Failed to persist cache to storage:', error);
      }
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  private calculateSize(data: any): number {
    try {
      const jsonString = JSON.stringify(data);
      return new Blob([jsonString]).size;
    } catch {
      // Fallback estimation
      return JSON.stringify(data).length * 2;
    }
  }

  private compressData(data: any): {
    compressed: string;
    originalSize: number;
    compressedSize: number;
  } {
    if (!this.config.compressionEnabled) {
      const serialized = JSON.stringify(data);
      return {
        compressed: serialized,
        originalSize: serialized.length,
        compressedSize: serialized.length,
      };
    }

    try {
      const original = JSON.stringify(data);
      // Simple compression using LZ-string-like approach
      const compressed = this.simpleCompress(original);

      this.stats.compressionSaves += original.length - compressed.length;

      return {
        compressed,
        originalSize: original.length,
        compressedSize: compressed.length,
      };
    } catch (error) {
      const fallback = JSON.stringify(data);
      return {
        compressed: fallback,
        originalSize: fallback.length,
        compressedSize: fallback.length,
      };
    }
  }

  private decompressData(compressed: string): any {
    if (!this.config.compressionEnabled) {
      return JSON.parse(compressed);
    }

    try {
      const decompressed = this.simpleDecompress(compressed);
      return JSON.parse(decompressed);
    } catch (error) {
      // Fallback to direct parsing
      return JSON.parse(compressed);
    }
  }

  private simpleCompress(str: string): string {
    // Simple run-length encoding for demonstration
    // In production, use a proper compression library
    return str.replace(/(.)\1+/g, (match, char) => {
      return match.length > 3 ? `${char}${match.length}` : match;
    });
  }

  private simpleDecompress(str: string): string {
    // Reverse of simple compression
    return str.replace(/(.)\d+/g, (match, char) => {
      const count = parseInt(match.slice(1));
      return char.repeat(count);
    });
  }

  private evictLRU(): void {
    if (this.cache.size === 0) return;

    // Find least recently used entry
    let lruKey = '';
    let lruTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed.getTime() < lruTime) {
        lruTime = entry.lastAccessed.getTime();
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  private evictBySize(): void {
    const currentSize = this.getCurrentSize();
    if (currentSize <= this.config.maxSize) return;

    // Sort entries by priority and access frequency
    const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) => {
      const scoreA =
        (a.priority * a.accessCount) / Math.max(1, (Date.now() - a.lastAccessed.getTime()) / 1000);
      const scoreB =
        (b.priority * b.accessCount) / Math.max(1, (Date.now() - b.lastAccessed.getTime()) / 1000);
      return scoreA - scoreB; // Lower score = more likely to be evicted
    });

    let freedSize = 0;
    const targetSize = this.config.maxSize * 0.8; // Free up to 80% of max size

    for (const [key, entry] of entries) {
      this.cache.delete(key);
      freedSize += entry.size;
      this.stats.evictions++;

      if (currentSize - freedSize <= targetSize) {
        break;
      }
    }
  }

  private getCurrentSize(): number {
    return Array.from(this.cache.values()).reduce((total, entry) => total + entry.size, 0);
  }

  private generateCacheKey(
    type: string,
    role: UserRole,
    modules: string[],
    permissions: PageId[],
    params?: Record<string, any>
  ): string {
    const baseKey = `${type}:${role}:${modules.sort().join(',')}:${permissions.sort().join(',')}`;
    if (params) {
      const paramString = Object.keys(params)
        .sort()
        .map(key => `${key}=${JSON.stringify(params[key])}`)
        .join('&');
      return `${baseKey}:${paramString}`;
    }
    return baseKey;
  }

  // Public API methods

  set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      tags?: string[];
      priority?: number;
    } = {}
  ): void {
    const { ttl = this.config.defaultTTL, tags = [], priority = 1 } = options;

    const compressed = this.compressData(data);
    const now = new Date();

    const entry: CacheEntry<string> = {
      data: compressed.compressed,
      timestamp: now,
      expiresAt: new Date(now.getTime() + ttl),
      accessCount: 0,
      lastAccessed: now,
      size: compressed.compressedSize,
      tags,
      priority,
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.evictBySize();
    this.persistCache();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.stats.hits++;

    try {
      return this.decompressData(entry.data);
    } catch (error) {
      console.warn('Failed to decompress cache entry:', error);
      this.cache.delete(key);
      return null;
    }
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.persistCache();
  }

  // Stats-specific cache methods
  cacheStats(
    role: UserRole,
    modules: string[],
    permissions: PageId[],
    stats: StatsCardData[],
    ttl?: number
  ): void {
    const key = this.generateCacheKey('stats', role, modules, permissions);
    this.set(key, stats, {
      ttl,
      tags: ['stats', role, ...modules],
      priority: 10,
    });
  }

  getCachedStats(role: UserRole, modules: string[], permissions: PageId[]): StatsCardData[] | null {
    const key = this.generateCacheKey('stats', role, modules, permissions);
    return this.get<StatsCardData[]>(key);
  }

  cacheAggregatedStats(
    role: UserRole,
    modules: string[],
    permissions: PageId[],
    aggregatedStats: StatsCardData[],
    ttl?: number
  ): void {
    const key = this.generateCacheKey('aggregated-stats', role, modules, permissions);
    this.set(key, aggregatedStats, {
      ttl,
      tags: ['aggregated-stats', role, ...modules],
      priority: 8,
    });
  }

  getCachedAggregatedStats(
    role: UserRole,
    modules: string[],
    permissions: PageId[]
  ): StatsCardData[] | null {
    const key = this.generateCacheKey('aggregated-stats', role, modules, permissions);
    return this.get<StatsCardData[]>(key);
  }

  // Cache invalidation
  addInvalidationRule(rule: CacheInvalidationRule): void {
    this.invalidationRules.push(rule);
  }

  invalidateByTag(tag: string): number {
    let invalidated = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.persistCache();
    }

    return invalidated;
  }

  invalidateByPattern(pattern: RegExp): number {
    let invalidated = 0;

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.persistCache();
    }

    return invalidated;
  }

  invalidateExpired(): number {
    let invalidated = 0;
    const now = new Date();

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.persistCache();
    }

    return invalidated;
  }

  // Cache maintenance
  cleanup(): void {
    // Remove expired entries
    this.invalidateExpired();

    // Apply invalidation rules
    for (const rule of this.invalidationRules) {
      for (const [key, entry] of this.cache.entries()) {
        const shouldInvalidate =
          rule.pattern.test(key) ||
          rule.tags.some(tag => entry.tags.includes(tag)) ||
          Date.now() - entry.timestamp.getTime() > rule.maxAge ||
          (rule.condition && rule.condition(entry));

        if (shouldInvalidate) {
          this.cache.delete(key);
        }
      }
    }

    // Ensure we're within size limits
    this.evictBySize();

    this.persistCache();
  }

  optimize(): void {
    // Remove least valuable entries if cache is getting full
    if (this.cache.size > this.config.maxEntries * 0.8) {
      const entries = Array.from(this.cache.entries());

      // Sort by value score (access frequency vs age)
      entries.sort(([, a], [, b]) => {
        const ageA = Date.now() - a.lastAccessed.getTime();
        const ageB = Date.now() - b.lastAccessed.getTime();
        const scoreA = a.accessCount / Math.max(1, ageA / 1000);
        const scoreB = b.accessCount / Math.max(1, ageB / 1000);
        return scoreA - scoreB;
      });

      // Remove bottom 20%
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
        this.stats.evictions++;
      }
    }

    this.persistCache();
  }

  // Statistics and monitoring
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalRequests = this.stats.hits + this.stats.misses;

    // Calculate top accessed keys
    const keyAccess = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, accessCount: entry.accessCount }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);

    return {
      totalSize: this.getCurrentSize(),
      totalEntries: this.cache.size,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (this.stats.misses / totalRequests) * 100 : 0,
      evictionCount: this.stats.evictions,
      compressionRatio:
        this.stats.compressionSaves > 0 ? this.stats.compressionSaves / this.getCurrentSize() : 0,
      oldestEntry:
        entries.length > 0 ? new Date(Math.min(...entries.map(e => e.timestamp.getTime()))) : null,
      newestEntry:
        entries.length > 0 ? new Date(Math.max(...entries.map(e => e.timestamp.getTime()))) : null,
      topAccessedKeys: keyAccess,
    };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      compressionSaves: 0,
    };
  }

  getConfig(): CacheConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Cleanup
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Export singleton instance
export const dashboardCacheService = new DashboardCacheService();

export default dashboardCacheService;
