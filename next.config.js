let withBundleAnalyzer = (c) => c
try {
  const analyzeBundles = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
    openAnalyzer: false,
    analyzerMode: process.env.ANALYZE_REPORT_MODE === 'json' ? 'json' : 'static',
  })
  withBundleAnalyzer = (config) => {
    const analyzed = analyzeBundles(config)
    if (process.env.ANALYZE !== 'true' || process.env.ANALYZE_TARGET !== 'client') return analyzed
    return {
      ...analyzed,
      webpack(webpackConfig, options) {
        // Server bundle reports add substantial parsing/serialization memory.
        // A client diagnostic still builds and strictly checks the whole app.
        if (options.nextRuntime) {
          return typeof config.webpack === 'function' ? config.webpack(webpackConfig, options) : webpackConfig
        }
        return analyzed.webpack(webpackConfig, options)
      },
    }
  }
} catch (e) {
  // bundle-analyzer not available, pass-through
}

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  // Reconnection and installation must not reload an active field workspace.
  reloadOnOnline: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  cacheOnFrontEndNav: false,
  fallbacks: { document: '/offline' },
    disable:
      process.env.NODE_ENV !== 'production' ||
      process.env.DISABLE_PWA === 'true' ||
      (process.platform === 'win32' && process.env.ENABLE_PWA_ON_WINDOWS !== 'true'),
    workboxOptions: {
      disableDevLogs: true,
      skipWaiting: false,
      clientsClaim: false,
      runtimeCaching: [
        // Failed navigation shows public recovery, never cached private HTML.
        { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkOnly', options: {} },
      ]
    },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Preserve the owned loopback origin during auth redirects. Next's default
  // normalizer rewrites 127.0.0.1 to localhost, which separates cookies/drawings.
  skipMiddlewareUrlNormalize: true,
  // Standalone output — smaller deploy, lower RAM
  // Use 'export' for Capacitor mobile builds (set MOBILE_BUILD=true)
  output: process.env.MOBILE_BUILD === 'true' ? 'export' : 'standalone',
  // Isolate analyzer builds from a running local app's .next output.
  // Analyzer jobs can opt into a separate output directory via this variable.
  distDir: process.env.METARDU_NEXT_DIST_DIR || '.next',

  // PDF.js loads standard font files at runtime for text extraction. They are
  // not discovered by Next's standalone tracer from the dynamic font path, so
  // include them only with the authenticated parser upload route.
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/pdfkit/js/data/*.afm'],
    '/api/parsers/upload': [
      './node_modules/pdfjs-dist/standard_fonts/**/*',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
  },
// Local test and audit artifacts are not application inputs. Keep them out of
// the standalone deployment trace without weakening runtime dependency tracing.
  outputFileTracingExcludes: {
    '/*': [
      './.env*',
      './**/.env*',
      './.pytest_cache',
      './.pytest_cache/**/*',
      './**/.pytest_cache/**/*',
      './coverage/**/*',
      // Test and audit artifacts can contain local runtimes or permission-
      // restricted files; none are production inputs, so keep them out of the
      // standalone trace instead of shipping the workspace's test outputs.
      './live-test-results',
      './live-test-results/**/*',
      './test-results',
      './test-results/**/*',
      './e2e-results',
      './e2e-results/**/*',
      './map-audit-results',
      './map-audit-results/**/*',
      './.playwright-mcp',
      './.playwright-mcp/**/*',
      './agent-ctx',
      './agent-ctx/**/*',
      './.artifacts',
      './.artifacts/**/*',
    ],
    // The local storage fallback keeps share-target uploads under this
    // default path. These user files are never deploy-time assets.
    '/import/share-target': ['./upload/shared/**/*-*'],
  },

  reactStrictMode: true,

  async redirects() {
    return [
      {
        source: '/community',
        destination: '/marketplace',
        permanent: false,
      },
    ]
  },

  // SWC minifier — 20x faster than Terser, enabled by default in Next 14.
  // (Earlier comment said "Disabled — breaks OpenLayers" but the value was
  // actually `true`. OpenLayers tile rendering issues were traced to a
  // different cause and fixed separately. swcMinify stays on for speed.)

  // ─── Image optimization (enabled for web, disabled for Capacitor mobile builds) ───
  images: {
    unoptimized: process.env.MOBILE_BUILD === 'true',
    minimumCacheTTL: 60 * 60 * 24,
  },

  // ─── Linting & TypeScript ───
  eslint: {
    ignoreDuringBuilds: true,  // ESLint still has ~1300 any warnings; run via CI separately
  },
  typescript: {
    // Keep isolated bundle-analysis builds from rewriting the app's tsconfig
    // with analyzer-generated route types.
    tsconfigPath: process.env.ANALYZE === 'true' ? 'tsconfig.analyze.json' : 'tsconfig.json',
    // AUDIT FIX (C10, 2026-07-02): Was `ignoreBuildErrors: process.env.IGNORE_TYPE_ERRORS === 'true'`.
    // Type errors now block the build — tsc --noEmit passes clean.
    ignoreBuildErrors: false,
  },

  // ─── Performance settings ───
  compress: true,
  poweredByHeader: false,
  generateEtags: true,

  // ─── Tree-shaking for heavy packages ───
  // Only imports the named exports actually used instead of the entire package
  serverExternalPackages: [
      'pg',
      'canvas',
      '@google-cloud/storage',
      'bcryptjs',
      'better-sqlite3',
      'three',
      'pdfjs-dist',
      // PDFKit reads built-in font metrics relative to its installed module.
      // Bundling relocates __dirname and breaks native document routes.
      'pdfkit',
    ],
  experimental: {
    // A custom webpack config disables Next's worker by default. Release its
    // compilation heap before the mandatory strict type-check and page build.
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    cpus: 2,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    optimizePackageImports: [
      // NOTE: 'ol' removed — it breaks dynamic imports of 42+ ol/* submodules
      // used by MapClient.tsx. The ol package uses side-effectful modules
      // (e.g. ol/proj/proj4 register()) that conflict with tree-shaking
      // when combined with output: "standalone".
      'lucide-react',
      'recharts',
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
    ],
  },

  // ─── Webpack configuration for OpenLayers ───
  webpack: (config, { isServer, nextRuntime }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      // AUDIT (2026-09-13): was crypto-browserify on client (~300 KB dead polyfill
      //      bytes co-located with react in an eager chunk). No client-reachable module
      //      imports node 'crypto' anymore (renderers migrated to WebCrypto sha256Hex),
      //      so false is safe; if a build fails here, the offender must be migrated or
      //      made server-only — NOT reverted.
      crypto: false,
    }

    // Middleware/edge bundles must stay self-contained. The catch-all
    // `vendor-common` splitChunks group below emits shared CJS chunks that
    // the Edge sandbox evaluates in ESM scope — 'ReferenceError: exports
    // is not defined' on every middleware request (vercel/next.js#51313).
    // Skipping code-splitting for the edge compilation keeps middleware in
    // one ESM-compatible chunk; the app/server compilation keeps the full
    // splitChunks config below.
    if (isServer && nextRuntime === 'edge') {
      config.optimization.splitChunks = false
      return config
    }

    if (isServer) {
      config.externals = config.externals || []
      config.externals.push(/^ol/)
      // Externalize heavy server-only native modules
      config.externals.push('better-sqlite3', 'canvas')
    } else {
      // jszip's CJS lib requires readable-stream@2 (a Node polyfill: ~150 KB of
      // stream machinery + its buffer dep) even though jszip ships a fully
      // self-contained browser bundle with the identical API and zero stream
      // requires. Alias the client build to that bundle so the polyfill tree
      // never enters the client graph. Server keeps the CJS lib (real Node
      // streams, better memory behaviour for large batch ZIPs).
      config.resolve.alias = {
        ...(Array.isArray(config.resolve.alias) ? {} : config.resolve.alias),
        jszip: require.resolve('jszip/dist/jszip.min.js'),
      }
      // Client-side: externalize Node.js built-ins that pg transitively depends on.
      // These are pulled in when client components (e.g. checkout/page.tsx) import
      // server modules (enterprise/auditTrail → db.ts → pg).
      config.externals = config.externals || []
      config.externals.push('pg', 'pg-native', 'pg-protocol', 'pg-connection-string',
        'pg-pool', 'pg-types', 'pg-cursor', 'async_hooks', 'dns', 'net', 'tls')
    }

    // These vendor groups are for browser delivery only. Splitting the Node
    // server build provides no browser benefit and can separate a server
    // action from the worker map Next uses to emit its manifest.
    if (!isServer) {
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        ...config.optimization?.splitChunks,
        chunks: 'all',
        // Warning threshold for individual chunks (kB) — surfaces oversized chunks in build logs
        minSize: 20_000,
        // Cap automatic chunk size so a single vendor can't balloon past 244 KB uncompressed
        maxSize: 244_000,
        cacheGroups: {
          ...config.optimization?.splitChunks?.cacheGroups,
          // OpenLayers — base maps + COGO (15MB on disk, ~600KB minified)
          openlayers: {
            test: /[\\/]node_modules[\\/]ol[\\/]/,
            name: 'vendor-ol',
            chunks: 'all',
            priority: 30,
          },
          // Three.js — 3D point cloud viewer (38MB on disk, ~1MB minified)
          // Only loaded by /tools/point-cloud-import — keep out of main bundle
          three: {
            test: /[\\/]node_modules[\\/]three[\\/]/,
            name: 'vendor-three',
            chunks: 'all',
            priority: 30,
          },
          // pdfjs-dist — PDF viewer used by /documents and OCR import (41MB on disk)
          pdfjs: {
            test: /[\\/]node_modules[\\/]pdfjs-dist[\\/]/,
            name: 'vendor-pdfjs',
            chunks: 'all',
            priority: 30,
          },
          // pdf-lib — PDF generation/manipulation (24MB on disk, ~500KB minified)
          // Used by deed plan renderer, statutory workbook, form generators
          pdfLib: {
            test: /[\\/]node_modules[\\/]pdf-lib[\\/]/,
            name: 'vendor-pdf-lib',
            chunks: 'all',
            priority: 30,
          },
          // pdfkit — server-side PDF generation (8MB on disk)
          pdfkit: {
            test: /[\\/]node_modules[\\/]pdfkit[\\/]/,
            name: 'vendor-pdfkit',
            chunks: 'all',
            priority: 30,
          },
          // ExcelJS — spreadsheet I/O (23MB on disk, ~700KB minified)
          // Used by field book importer, statutory workbook generator
          exceljs: {
            test: /[\\/]node_modules[\\/]exceljs[\\/]/,
            name: 'vendor-exceljs',
            chunks: 'all',
            priority: 30,
          },
          // Turf — geospatial analysis (9.6MB on disk)
          turf: {
            test: /[\\/]node_modules[\\/]@turf[\\/]/,
            name: 'vendor-turf',
            chunks: 'all',
            priority: 30,
          },
          // Recharts — charting library (5.4MB on disk, ~400KB minified)
          recharts: {
            test: /[\\/]node_modules[\\/]recharts[\\/]/,
            name: 'vendor-recharts',
            chunks: 'all',
            priority: 25,
          },
          // proj4 — coordinate transformations (1.6MB on disk, ~150KB minified)
          proj4: {
            test: /[\\/]node_modules[\\/]proj4[\\/]/,
            name: 'vendor-proj4',
            chunks: 'all',
            priority: 25,
          },
          // JSZip — ZIP archive utilities (1.2MB on disk, ~95KB minified)
          jszip: {
            test: /[\\/]node_modules[\\/]jszip[\\/]/,
            name: 'vendor-jszip',
            chunks: 'all',
            priority: 25,
          },
          // D3 family — used by recharts + contour generator
          d3: {
            test: /[\\/]node_modules[\\/]d3(-[a-z]+)?[\\/]/,
            name: 'vendor-d3',
            chunks: 'all',
            priority: 20,
          },
          // Radix UI primitives — shared across all dashboards
          radix: {
            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            name: 'vendor-radix',
            chunks: 'all',
            priority: 15,
          },
          // Keep any Node polyfills that reach the browser graph out of the
          // eager React vendor chunk. crypto-browserify is not a direct app
          // dependency; this isolates any remaining transitive polyfills.
          nodePolyfills: {
            test(module) {
              const p = module.resource || module.nameForCondition?.() || ''
              return /[\\/]node_modules[\\/](crypto-browserify|browserify-sign|browserify-cipher|browserify-des|browserify-rsa|browserify-aes|create-ecdh|create-hash|create-hmac|diffie-hellman|pbkdf2|public-encrypt|randomfill|readable-stream|asn1|elliptic|bn\.js|hash\.js|vm-browserify|process)([\\/]|$)/.test(p)
            },
            name: 'vendor-node-polyfills',
            chunks: 'all',
            priority: 28,
            enforce: true,
          },
          // Sentry SDK (@sentry/nextjs + deps). Every app-code entry point
          // (instrumentation-client, webVitals, error boundaries, apiHandler,
          // logger) now loads it via dynamic import, so the SDK is only
          // reachable from async chunks. But the catch-all vendor-common
          // cacheGroup co-locates those async-only modules into shared chunks
          // that initial chunks must fetch (~145 KB on every eager page load).
          // Isolating them into their own async-fetched group mirrors the
          // nodePolyfills fix above.
          sentrySdk: {
            test(module) {
              const p = module.resource || module.nameForCondition?.() || ''
              return /[\\/]node_modules[\\/](@sentry|@opentelemetry)[\\/]/.test(p)
            },
            name: 'vendor-sentry',
            chunks: 'async',
            priority: 28,
            enforce: true,
          },
          // Preserve Next's default sharing for other dependencies. Giving
          // every vendor the same name merges lazy-only modules into startup.
        },
      },
    }
    }

    return config
  },

  // ─── Headers for performance & security ───
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    // Allow the CSP to work with any domain (production, staging, dev)
    // instead of hardcoding metardu.space which breaks other environments
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    const siteHost = siteUrl ? new URL(siteUrl).hostname : ''
    const wssHost = siteHost ? `wss://${siteHost}` : ''
    const httpsHost = siteHost ? `https://${siteHost}` : ''

    // Build connect-src with dynamic host or fallback to 'self'
    const connectSrcParts = [
      "'self'",
      "blob:",
    ]
    if (httpsHost) connectSrcParts.push(httpsHost)
    if (wssHost) connectSrcParts.push(wssHost)
    // Always allow these external services
    connectSrcParts.push(
      "https://ipapi.co",
      "https://*.upstash.io",
      "https://api.anthropic.com",
      "https://sentry.io",
      "https://*.sentry.io",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      "https://tile.openstreetmap.org",
      "https://*.tile.openstreetmap.org",
      "https://server.arcgisonline.com",
      "https://*.arcgisonline.com",
      "https://*.basemaps.cartocdn.com",
    )

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
          // AUDIT FIX (M10, 2026-07-02): CSP removed from next.config.js.
          // Previously this static CSP with 'unsafe-inline' for scripts
          // overrode the middleware's nonce-based CSP, making the nonce
          // useless. CSP is now set exclusively in middleware.ts via
          // getCspHeaders() — which generates a per-request nonce AND
          // includes 'unsafe-inline' (required for Next.js 14 RSC inline
          // scripts). When upgrading to Next.js 15, 'unsafe-inline' can
          // be removed from the middleware CSP since Next.js 15 properly
          // injects nonces into RSC scripts.
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        // Production output has versioned paths. Development chunk URLs are
        // reused, so caching them immutably hides source updates even on reload.
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: isProd ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        // Only fingerprinted font filenames receive immutable public caching.
        source: '/fonts/:font([a-f0-9]{16}[-.a-z]*\\.woff2)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // API responses may contain account, project, report, or export data.
        // Default them all to private; Cloudflare rules must never override it.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        // Authenticated workspaces render user-specific RSC/HTML responses.
        source: '/project/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/dashboard/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/projects/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/field/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/fieldbook/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/map/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/reports/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/account/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/connect/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/login/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/register/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/documents/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      ...['survey', 'organization', 'settings', 'subscription', 'checkout'].map((route) => ({
        source: `/${route}/:path*`,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      })),
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
      withBundleAnalyzer(withPWA(nextConfig)),
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
  : withBundleAnalyzer(withPWA(nextConfig))
