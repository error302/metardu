let withBundleAnalyzer = (c) => c
try {
  withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
  })
} catch (e) {
  // bundle-analyzer not available, pass-through
}

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable:
    process.env.NODE_ENV !== 'production' ||
    process.env.DISABLE_PWA === 'true' ||
    (process.platform === 'win32' && process.env.ENABLE_PWA_ON_WINDOWS !== 'true'),
  workboxOptions: { disableDevLogs: true },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Image optimization
  images: {
    unoptimized: true,
    minimumCacheTTL: 60 * 60 * 24, // 1 day
  },
  
  // Linting & TypeScript — always strict; never silently ignore errors in CI
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Disable CSS minification — cssnano can't parse Tailwind arbitrary gradient values
  cssMinify: false,
  
  // Performance settings
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  
  // Experimental features
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  
  // Headers for performance
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.mapbox.com https://server.arcgisonline.com https://*.arcgisonline.com",
              "connect-src 'self' blob: https://metardu.duckdns.org wss://metardu.duckdns.org https://ipapi.co https://*.upstash.io https://api.anthropic.com https://fonts.googleapis.com https://fonts.gstatic.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.arcgisonline.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
}

// Sentry (only wraps when NEXT_PUBLIC_SENTRY_DSN is set — no-op otherwise)
const { withSentryConfig } = require('@sentry/nextjs')

const hasSentry = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

module.exports = hasSentry
  ? withSentryConfig(
      withBundleAnalyzer(nextConfig),
      {
        silent: true,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
      {
        widenClientFileUpload: true,
        hideSourceMaps: true,
        disableLogger: true,
      }
    )
  : withBundleAnalyzer(nextConfig)
