/**
 * In-Memory LRU Cache Layer
 * 
 * Reduces database load by caching frequently accessed reference data
 * and computation results. Critical for:
 * - Coordinate system parameters (rarely change)
 * - Datum transformation parameters (never change)
 * - Project metadata (changes infrequently)
 * - Survey computation results (changes on re-computation only)
 * 
 * This is the FIRST line of defense against database overload.
 * Most survey reads hit this cache, not the database.
 */

// ─── Types ───────────────────────────────────────────────────────

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;  // Unix timestamp in ms
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
  key: string;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;  // Time to live in ms
}

// ─── LRU Cache Implementation ────────────────────────────────────

export class LRUCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number;
  private hits = 0;
  private misses = 0;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.maxSize = config.maxSize ?? 1000;
    this.defaultTTL = config.defaultTTL ?? 5 * 60 * 1000; // 5 minutes
  }
  
  /**
   * Get a value from cache.
   * Returns undefined if not found or expired.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return undefined;
    }
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    
    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    
    // Move to end (most recently used) — LRU eviction
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry.value;
  }
  
  /**
   * Set a value in cache.
   */
  set(key: string, value: T, ttl?: number): void {
    // Remove existing entry if present
    this.cache.delete(key);
    
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTTL),
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
      key,
    });
  }
  
  /**
   * Get a value, computing it if not cached (read-through pattern).
   * This is the primary way to use the cache — it handles misses automatically.
   */
  async getOrCompute(key: string, computeFn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    
    const value = await computeFn();
    this.set(key, value, ttl);
    return value;
  }
  
  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Invalidate all entries matching a pattern.
   */
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    hits: number;
    misses: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
      hits: this.hits,
      misses: this.misses,
    };
  }
  
  /**
   * Clean up expired entries.
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }
}

// ─── Pre-configured Cache Instances ──────────────────────────────

/** Coordinate system parameters — rarely change, 24h TTL */
export const coordinateSystemCache = new LRUCache({
  maxSize: 100,
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
});

/** Datum transformation parameters — never change, 7-day TTL */
export const datumCache = new LRUCache({
  maxSize: 50,
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
});

/** Project metadata — changes infrequently, 5min TTL */
export const projectCache = new LRUCache({
  maxSize: 200,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
});

/** Survey computation results — changes on re-computation, 1h TTL */
export const computationCache = new LRUCache({
  maxSize: 500,
  defaultTTL: 60 * 60 * 1000, // 1 hour
});

/** Reference data (beacons, control points) — changes rarely, 1h TTL */
export const referenceDataCache = new LRUCache({
  maxSize: 1000,
  defaultTTL: 60 * 60 * 1000, // 1 hour
});

// ─── Cache Key Helpers ───────────────────────────────────────────

export const CacheKeys = {
  project: (id: string) => `project:${id}`,
  projectList: (userId: string, page: number) => `projects:${userId}:${page}`,
  survey: (id: string) => `survey:${id}`,
  surveyObservations: (surveyId: string) => `observations:${surveyId}`,
  surveyCoordinates: (surveyId: string) => `coordinates:${surveyId}`,
  computation: (surveyId: string, method: string) => `computation:${surveyId}:${method}`,
  coordinateSystem: (id: string) => `coordsys:${id}`,
  datumParams: (from: string, to: string) => `datum:${from}:${to}`,
  document: (id: string) => `document:${id}`,
  referenceBeacons: (area: string) => `beacons:${area}`,
};
