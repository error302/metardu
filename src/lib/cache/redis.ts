/**
 * Redis Cache Layer for METARDU
 * Enterprise-grade caching for API responses and session data
 */

import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

class RedisCache {
  private client: ReturnType<typeof createClient> | null = null
  private isConnected = false

  async connect(): Promise<void> {
    if (this.isConnected) return

    try {
      this.client = createClient({ url: REDIS_URL })
      this.client.on('error', (err) => console.error('Redis Client Error:', err))
      await this.client.connect()
      this.isConnected = true
      console.log('[Redis] Connected successfully')
    } catch (error) {
      console.error('[Redis] Connection failed:', error)
      // Fallback: cache will be disabled but app continues working
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) return null

    try {
      const value = await this.client.get(key)
      return value ? JSON.parse(value as string) : null
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    if (!this.isConnected || !this.client) return

    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value))
    } catch {
      // Silently fail - app continues working
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return

    try {
      await this.client.del(key)
    } catch {
      // Silently fail
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.client) return

    try {
      const keys = await this.client.keys(pattern)
      if (keys.length > 0) {
        await this.client.del(keys)
      }
    } catch {
      // Silently fail
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached) return cached

    const value = await factory()
    await this.set(key, value, ttlSeconds)
    return value
  }

  async increment(key: string, amount = 1): Promise<number> {
    if (!this.isConnected || !this.client) return 0

    try {
      return await this.client.incrBy(key, amount) as number
    } catch {
      return 0
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.isConnected || !this.client) return

    try {
      await this.client.expire(key, seconds)
    } catch {
      // Silently fail
    }
  }

  // Cache keys generators
  static keys = {
    project: (id: string) => `project:${id}`,
    projectList: (userId: string) => `projects:list:${userId}`,
    surveyPoints: (projectId: string) => `survey_points:${projectId}`,
    submissions: (projectId: string) => `submissions:${projectId}`,
    surveyTool: (tool: string, params: string) => `tool:${tool}:${params}`,
    userSession: (sessionId: string) => `session:${sessionId}`,
    rateLimit: (key: string) => `ratelimit:${key}`,
  }
}

// Singleton instance
const redisCache = new RedisCache()
export default redisCache
export { RedisCache }

// Initialize on import if in production
if (process.env.NODE_ENV === 'production') {
  redisCache.connect().catch(() => {
    console.log('[Redis] Will use fallback (no caching)')
  })
}

// Helper for API route caching
export function withCache<T>(
  fn: () => Promise<T>,
  key: string,
  ttlSeconds = 300
): Promise<T> {
  return redisCache.getOrSet(key, fn, ttlSeconds)
}

// Cache middleware for Next.js API routes
export async function cacheMiddleware(
  request: Request,
  cacheKey: string,
  ttlSeconds = 60
): Promise<Response | null> {
  // Only cache GET requests
  if (request.method !== 'GET') return null

  const cached = await redisCache.get<ResponseCache>(cacheKey)
  if (cached) {
    return new Response(JSON.stringify(cached.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-TTL': ttlSeconds.toString(),
      },
    })
  }

  return null
}

interface ResponseCache {
  data: any
  timestamp: number
}
