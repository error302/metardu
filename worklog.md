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
