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
  // Standalone output — smaller deploy, lower RAM
  output: "standalone",

  reactStrictMode: true,

  // ─── Image optimization (disabled — VM has no image optimization needs) ───
  images: {
    unoptimized: true,
    minimumCacheTTL: 60 * 60 * 24,
  },

  // ─── Linting & TypeScript ───
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
    // Note: ignoreBuildErrors enabled for rapid development.
    // CI pipeline runs tsc --noEmit separately for strict type checking.
  },

  // ─── Performance settings ───
  compress: true,
  poweredByHeader: false,
  generateEtags: true,

  // ─── Tree-shaking for heavy packages ───
  // Only imports the named exports actually used instead of the entire package
  experimental: {
    // Next 14 expects server-only externals under the experimental flag.
    serverComponentsExternalPackages: [
      'pg',
      'canvas',
      '@google-cloud/storage',
      'bcryptjs',
    ],
    optimizePackageImports: [
      'ol',
      'lucide-react',
      'recharts',
      'd3-array',
      'd3-contour',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'date-fns',
      '@tanstack/react-table',
    ],
  },

  // ─── Headers for performance & security ───
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
              "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.mapbox.com https://server.arcgisonline.com https://*.arcgisonline.com https://*.basemaps.cartocdn.com",
              "connect-src 'self' blob: https://metardu.duckdns.org wss://metardu.duckdns.org https://ipapi.co https://*.upstash.io https://api.anthropic.com https://sentry.io https://*.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.arcgisonline.com https://*.basemaps.cartocdn.com",
              "worker-src 'self' blob:",
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

const hasSentry =
  process.env.NODE_ENV === 'production' &&
  Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

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
