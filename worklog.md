---
Task ID: 1
Agent: main
Task: RAM optimization for metardu SaaS platform

Work Log:
- Analyzed entire codebase: 948 TS/TSX files, 105 routes, 93 dependencies
- Identified critical PM2 memory limit: 256MB was way too low → raised to 512MB heap + 600M restart limit
- Merged conflicting next.config.ts/.js into single optimized next.config.js
- Added `serverExternalPackages: ['pg', 'canvas', '@google-cloud/storage', 'bcryptjs']`
- Expanded `optimizePackageImports` to include recharts, all @radix-ui/*, d3-*, date-fns, @tanstack/react-table
- Removed 9 unused packages: @turf/turf, mathjs, ssh2, dxf-parser, shapefile, leaflet, react-leaflet, @types/leaflet, @types/mathjs, d3-delaunay, d3-geo, d3-scale
- Rewrote BathymetryMap.tsx from react-leaflet to OpenLayers
- Rewrote AnomalyHeatmap.tsx from leaflet to OpenLayers
- Rewrote beacons/page.tsx from react-leaflet to OpenLayers
- Deleted dead code: src/lib/offline/OfflineMap.tsx, src/types/leaflet.d.ts
- Converted 6 client components from static dxf-writer imports to dynamic `await import('dxf-writer')`
- Verified: 0 TypeScript errors, 0 ESLint errors

Stage Summary:
- Dependencies reduced from 93 → 81 (12 packages removed)
- RAM budget: 256MB → 512MB (PM2), restart threshold: 300M → 600M
- All mapping now unified on OpenLayers (no more leaflet/react-leaflet)
- All heavy client components already using next/dynamic with ssr:false
- dxf-writer deferred to runtime dynamic import in 6 client components

---
Task ID: 2
Agent: main
Task: Production readiness — security hardening, compliance, infrastructure

Work Log:
- Rewrote middleware.ts: replaced raw cookie check with next-auth/jwt getToken() validation, added x-user-id header injection
- Created requireAuth.ts: server-side auth guard for API routes + requireRole() for RBAC
- Created rateLimit.ts: in-memory rate limiter with per-endpoint limits (auth: 10/15min, mpesa: 3/min, api: 30/min)
- Created errors.ts: centralized error handling — AppError class + handleApiError with no info leakage
- Created logger.ts: structured JSON logging for PM2 + auditLog() function
- Created cors.ts: CORS helper with origin whitelist + OPTIONS preflight handler
- Created upload/validate.ts: file upload validation (MIME type, size, double extension, null byte checks)
- Created validation/surveyData.ts: Zod schemas for coordinates (Kenya bounds), projects, levelling
- Created 5 SQL migrations: RBAC (020), audit logs (021), RLS policies (022), compliance triggers (023), encryption (024)
- Created backup.sh: automated PostgreSQL backup with 7-day retention
- Created health-check.sh: PM2 status monitoring + RAM/swap alerts
- Created /api/public/health endpoint: unauthenticated health check (DB + latency)
- Created nginx-metardu: hardened Nginx config with rate limiting, TLS 1.3, security headers, attack path blocking
- Added M-Pesa Safaricom IP whitelist to callback handler
- Updated Stripe webhook verification to use constructEvent()
- Updated Capacitor config: cleartext=false, allowMixedContent=false, webContentsDebuggingEnabled=false
- Updated PM2 ecosystem: max_memory_restart=2G, --max-old-space-size=1024
- Fixed CRITICAL compliance: 12√K → 10√K in 8 edits across 4 files (Kenya Survey Act RDM 1.1)
- Migrated 16 files from getUser() → getSession() (timeout prevention)
- Updated .gitignore: added *.key, *.keystore, backups/, logs/, .env.production

Stage Summary:
- 0 TypeScript errors, 0 ESLint errors
- 7 new security utility modules created
- 5 SQL migrations ready for deployment
- All 14 brief sections addressed
- Critical compliance violation (12√K) fixed
- All auth calls migrated from getUser() to getSession()
