/**
 * Performance Configuration
 * Optimized settings for production
 */

export const PERFORMANCE_CONFIG = {
  // Redis Cache
  redis: {
    enabled: process.env.NODE_ENV === 'production',
    defaultTTL: 300, // 5 minutes
    maxTTL: 3600, // 1 hour
  },

  // API Caching
  api: {
    enabled: true,
    defaultTTL: 60, // 1 minute for dynamic data
    staticTTL: 3600, // 1 hour for static data
    maxAge: 86400, // 24 hours for CDN
  },

  // Database
  db: {
    connectionPoolSize: 20,
    slowQueryThreshold: 500, // ms
    queryTimeout: 30000, // 30 seconds
  },

  // Images
  images: {
    quality: 85,
    sizes: [640, 768, 1024, 1280, 1536, 1920],
    formats: ['image/webp', 'image/avif'],
  },

  // Monitoring
  monitoring: {
    enabled: true,
    reportInterval: 60000, // 1 minute
    sampleRate: 0.1, // 10% of requests
  },

  // CDN Headers
  cdn: {
    staticAssets: 'public, max-age=31536000, immutable',
    api: 'public, max-age=60, stale-while-revalidate=300',
    images: 'public, max-age=86400',
  },
}

// Performance budgets
export const PERFORMANCE_BUDGETS = {
  // Web Vitals
  FCP: 1800, // First Contentful Paint (ms)
  LCP: 2500, // Largest Contentful Paint (ms)
  FID: 100, // First Input Delay (ms)
  CLS: 0.1, // Cumulative Layout Shift
  TTFB: 600, // Time to First Byte (ms)

  // Bundle sizes
  jsBundle: 500 * 1024, // 500KB
  cssBundle: 50 * 1024, // 50KB
  imageBundle: 2 * 1024 * 1024, // 2MB

  // API response times
  apiResponse: 200, // ms
  dbQuery: 100, // ms
}

// Optimization flags
export const OPTIMIZATIONS = {
  // Enable/disable features
  enableCompression: true,
  enableCaching: true,
  enableImageOptimization: true,
  enableLazyLoading: true,
  enablePrefetching: true,
  enableMinification: true,
}
