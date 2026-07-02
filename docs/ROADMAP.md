# Metardu Roadmap

Last updated: 2026-06-30
Status: v0.3 redesign shipped, scope narrowed to cadastral + engineering + topographic

---

## Completed

### v0.3 Visual redesign (shipped)
- [x] Tinted dark theme (#1A1816 charcoal, #D17B47 sienna accent)
- [x] Font swap: Inter → Geist + Instrument Serif + JetBrains Mono
- [x] Removed glassmorphism, gradients, glow shadows, animated orbs
- [x] Three-mode theme system: Dark (default) · Light (alternate) · Field (sunlight)
- [x] Landing page: asymmetric editorial hero with topographic map + coordinate overlay
- [x] Tool pages: editorial PageHeader + flat paper cards (56 pages updated)
- [x] `prefers-reduced-motion` fallback, `text-wrap: balance` on headings

### Scope narrowing (shipped)
- [x] Removed: hydrographic (22 files), marine/USV (7 files), mining (11 files)
- [x] Kept: cadastral, engineering, topographic
- [x] Drone folded into topographic as a method
- [x] Deformation folded into engineering as a method
- [x] Cleaned all broken imports, dead nav links, sitemap entries

### Workflow hubs (shipped)
- [x] `/cadastral-workflow` — 5 steps, localStorage tracking, Kenya-specific hints
- [x] `/engineering-workflow` — 6 steps, RDM 1.1 accuracy standards
- [x] `/topographic-workflow` — 5 steps, scale/density reference

### Tool integrations (shipped)
- [x] Deed plan ← project traverse points (`/deed-plan?project=<id>`)
- [x] Contour generator ← project survey points (`/tools/contour-generator?project=<id>`)
- [x] Mutation plan ← project deed plan (`/tools/mutation-plan?project=<id>`)
- [x] New API: `GET /api/project/[id]/points`
- [x] New API: `GET /api/project/[id]/deed-plans`

### Backend infrastructure (shipped)
- [x] API response envelope v3 (`{ data, error: { code, message, details } }`)
- [x] Offline mutation queue (IndexedDB, auto-sync on reconnect)
- [x] React Query onlineManager integration (Capacitor Network plugin)
- [x] Health check endpoints (`/api/health/live`, `/api/health/ready`)
- [x] API conventions doc (`docs/API_CONVENTIONS_V3.md`)
- [x] System design doc (`docs/SYSTEM_DESIGN_V3.md`)

### NextAuth v5 (staged, not activated)
- [x] `src/lib/auth-v5.ts` — complete v5 config (JWT, cookie cache, createUser hooks)
- [x] `scripts/auth-v5-codemod.js` — dry-run found 44 files / 46 call-sites
- [ ] Install `next-auth@beta`, run codemod, apply Prisma migration, activate

---

## Next up — integrations to finish

### Engineering integrations
- [x] Cross-sections tool auto-pulls from project levelling data
  - Reuses `GET /api/project/[id]/points` (filter points with elevation along chainage)
  - `/tools/cross-sections?project=<id>` auto-populates via `ProjectCrossSections` component
- [x] Earthworks tool auto-pulls from cross-sections
  - New API: `GET /api/project/[id]/cross-sections` — groups survey points by chainage (parsed from point name), supports optional `?interval=N` binning
  - `/tools/earthworks?project=<id>` auto-populates existing ground profiles via `ProjectCrossSections`

### Mutation plan deep integration
- [x] Refactor `MutationPlanGenerator` to accept `initialPlots` prop
  - `MutationPlanGenerator` now accepts `initialPlots?: MutationPlot[]`
  - `ProjectMutationPlan` passes deed plan boundary directly as prop
  - Removed sessionStorage bridge entirely — clean prop injection
  - Generator auto-advances to step 2 when initialPlots supplied

---

## Excellence features (from Gemini brainstorm, prioritized)

### Tier 1 — build next (high value, feasible)

#### ArdhiSasa/NLIMS pre-flight topological validator
**Why:** Surveyors get files rejected for sliver polygons, self-intersections, adjoiner overlaps. Pre-flight validation saves real hours. Sticky feature.
**How:** turf.js + jsts for topology checks. Block save on invalid geometry. Export with exact NLIMS attribute schema.
**Where:** `/cadastral-workflow` step 2 (boundary validate), plus standalone `/tools/topology-check`
**Effort:** 1 session
**Status:** ✅ SHIPPED — `/tools/topology-check`, 9 validation rules, turf.js engine

#### COGO deed plan reconstructor
**Why:** Historical paper deed plans list bearings/distances, not coordinates. Surveyors need to digitize these without AutoCAD.
**How:** Parser for DMS bearings + distances → compute ΔE/ΔN → OpenLayers LineString/Polygon. "Swing & scale" tool to snap onto known control.
**Where:** `/tools/cogo` (extend existing) or new `/tools/cogo-reconstruct`
**Effort:** 1-2 sessions
**Status:** ✅ SHIPPED — `/tools/cogo-reconstruct`, WCB + quadrant formats, swing & scale transform

#### As-built deviation guard (engineering)
**Why:** KeNHA tolerances are strict. Catching deviations early saves rework.
**How:** Linear referencing on design centerline. Compare as-built points vs design elevation. Green/amber/red visual feedback.
**Where:** `/engineering-workflow` step 6 (as-built), or `/tools/setting-out` extension
**Effort:** 1-2 sessions
**Status:** ✅ SHIPPED — `/tools/as-built-deviation`, KeNHA tolerance presets, linear interpolation

#### Generative lot subdivision & road network allocator (cadastral)
**Why:** Subdividing a 10ha parcel into 50×100 plots with road reserves takes days in CAD. Algorithmic generation in seconds + beacon list output is the highest-impact premium feature.
**How:** Parent polygon input → road spine placement → sweeping-line slice perpendicular to spine → child polygons → beacon coordinates. NOT Voronoi (irregular plots) — must produce standard rectangular plots (50×100, 100×100).
**Where:** New `/tools/subdivision-generator` or extend `/components/subdivision/SubdivisionPanel`
**Effort:** 2-3 sessions for core engine
**Status:** ✅ SHIPPED — `/tools/subdivision-generator`, Kenya plot presets, beacon CSV export

### Geodesy features (from Gemini "deep tech" analysis)

#### Combined Scale Factor (grid-to-ground area conversion)
**Why:** At Nairobi (1,798m elevation), a 100ha parcel has ~0.03ha discrepancy between grid area (UTM coordinates) and true ground area (physical surface). The deed plan must state ground area.
**How:** CSF = k × Fh (grid scale factor × elevation factor). Ground Area = Grid Area / CSF².
**Where:** `/tools/scale-factor`
**Effort:** 1 session
**Status:** ✅ SHIPPED — Kenya location presets, two conversion modes (direct + polygon), legal note

#### Helmert 7-Parameter Site Calibration (WGS84 ↔ Arc 1960)
**Why:** RTK rovers output WGS84. Survey of Kenya registry uses Arc 1960 (Clarke 1880 ellipsoid). Horizontal shift is 100-200m without transformation. This is Kenya's "silent killer."
**How:** 7-parameter similarity transformation (Tx, Ty, Tz, Rx, Ry, Rz, Scale) from 3+ control point pairs. Least squares for 4+ points.
**Where:** `/tools/site-calibration`
**Effort:** 2 sessions
**Status:** ✅ SHIPPED — Helmert engine, RMS residual analysis, batch transform, color-coded border inputs

#### Orthometric Height Conversion (EGM96 geoid)
**Why:** GNSS gives ellipsoidal height (above WGS84 ellipsoid). Engineering needs orthometric height (above sea level / geoid). Water flows by gravity (geoid), not ellipsoid. At Nairobi, correction is ~10m.
**How:** H = h - N. EGM96 5° grid with bilinear interpolation. Client-side, no external file.
**Where:** `/tools/orthometric-height`
**Effort:** 1 session
**Status:** ✅ SHIPPED — Single + batch modes, Kenya geoid reference table, CSV export, engineering note

#### Error Ellipse Visualization (95% confidence)
**Why:** LSA engine already computes error ellipses (semi-major, semi-minor, orientation). Surveyors need to see them visually to assess network quality. Military-grade software rejects circular error approximations.
**How:** SVG ellipse rendering in LSA results, scaled to fit, color-coded by threshold (green ≤20mm, amber 20-40mm, red >40mm). North arrow for orientation reference.
**Where:** `/tools/lsa` (inline in results)
**Effort:** 1 session
**Status:** ✅ SHIPPED — SVG ellipses with 95% confidence, per-station visualization, legend

### Tier 2 — build when needed (real but niche)

#### Dual-surface TIN volume comparison (topographic/engineering)
**How:** Extend existing `src/lib/engine/contours.ts` `computeVolumeFromTIN` to accept two TIN surfaces. Prismoidal column equation: `V = A_base × (Δz1+Δz2+Δz3)/3`. Cut/fill heatmap overlay on OpenLayers.
**Where:** Extend `/tools/earthworks` or new `/tools/volume-comparison` (route exists)
**Effort:** 1 session (extends existing volume code)
**Status:** ✅ SHIPPED — `/tools/volume-comparison` is live with TIN and IDW grid methods, cut/fill volume computation via `computeVolumeBetweenSurfaces`, CSV export for both summary report and cut/fill grid, and a cut/fill heatmap visualization. Two-surface input via file upload (CSV/XYZ/TXT) with side-by-side comparison.

#### Parabolic vertical curve profile designer (engineering)
**Why:** Highway alignment audit — checking crest/sag curves against stopping sight distance (SSD).
**How:** Parabolic curve equation `y = ((g2-g1)/2L)x² + g1·x + E_PVC`. K-factor check against design speed. Amber warning on failing curves.
**Where:** New `/tools/vertical-curve` or fold into as-built deviation guard as "design compliance" mode
**Effort:** 1 session
**Status:** ✅ SHIPPED — `/tools/vertical-curve-designer`, multi-VIP alignment engine, AASHTO K-factor + SSD compliance, SVG profile diagram, station table, CSV export. Engine: `src/lib/survey/curves/verticalCurveDesigner.ts` (31 tests passing).

#### Web Worker TIN generator
**Why:** Contour generation can freeze on large datasets.
**How:** Move Delaunay triangulation + contour interpolation to Web Worker.
**Status:** ✅ SHIPPED — `src/lib/workers/tinWorker.ts` + `tinWorkerClient.ts` with auto-fallback to sync engine when Workers unavailable. Promise-based API (`triangulateAsync`, `buildTINSurfaceAsync`, `generateContoursAsync`) with progress callbacks. 13 tests passing.

#### Automated breakline extraction
**Why:** Auto-draw toe-of-slope, top-of-bank from TIN mesh.
**How:** Compute triangle normal vectors, flag sharp angle changes, stitch into MultiLineString.
**Status:** ✅ SHIPPED — `src/lib/engine/breaklineExtraction.ts` (triangle-normal dihedral algorithm, polyline stitching, ridge/slope-change/minor classification, GeoJSON + Breakline[] export). Integrated into `BreaklineEditor` as a new "Auto" tab with threshold slider and live preview. 20 tests passing.

#### Spiral-to-curve alignment engine
**Why:** KeNHA highway design uses clothoid spirals.
**How:** Custom OpenLayers geometry for transition spirals. Dynamic chainage stationing.
**Status:** ✅ SHIPPED — `src/lib/survey/curves/spiralAlignment.ts` (TS→SC→CS→ST stationing, clothoid series expansion, world-coordinate output, station interpolation). UI: new "Spiral Alignment" tab on `/tools/curves` with SVG plan diagram and station table. 29 tests passing.

### Tier 3 — don't build (flawed or trap)

#### Web Bluetooth NTRIP client
**Why not:** Wrong Bluetooth stack (SPP vs GATT), wrong router (Pages vs App), Chromium-only, 3-month R&D trap. Metardu already has `NTRIPClientPanel` — use native Bluetooth, not Web Bluetooth API.

---

## Technical debt

### NextAuth v4 → v5 migration
- Config ready (`src/lib/auth-v5.ts`)
- Codemod ready (`scripts/auth-v5-codemod.js`, 44 files identified)
- Timeline: 2-week side-quest when there's a quiet window
- Blocker: needs Prisma schema migration + E2E test cycle

### Tool page deep refits
- PageHeader + card CSS updated globally (shipped)
- [x] Traverse page refit — added SVG `TraverseDiagram` component showing
      adjusted vs raw traverse, closing error vector, station markers,
      north arrow, scale bar. Pattern: field-book table + output diagram.
      Other pages (levelling, COGO, deed plan) can replicate this pattern.
- [ ] Levelling, COGO, deed plan page refits — same pattern, lower priority

### OKLCH color migration
- Current tokens are hex
- impeccable skill recommends OKLCH for perceptual uniformity
- Low priority — current palette works

### Prisma schema cleanup
- [x] Schema updated — `MINING` and `HYDROGRAPHIC` removed from `SurveyType`
      enum in `prisma/schema.prisma`
- [x] Migration SQL written — `prisma/migrations/20260702000000_drop_mining_hydrographic_survey_types/migration.sql`
      with pre-flight check queries, PostgreSQL enum-swap pattern, and
      post-migration verification queries
- [ ] Migration NOT YET APPLIED — user must run pre-flight queries against
      production DB, reassign any existing MINING/HYDROGRAPHIC projects,
      then `npm run migrate`. See migration SQL header for full procedure.

---

## Infrastructure

### Redis cache for calculators
- System design doc prescribes cache-aside for deterministic calculator results
- Needs Redis instance
- Expected 60-80% cache hit rate
- Build when QPS justifies it

### BullMQ async sync queue
- Current offline queue is synchronous (FIFO on reconnect)
- Parallel processing for large queues
- Build when queue depth > 1000 typical

### Multi-region deployment
- Single region fine for Kenya
- Build when expanding beyond East Africa

---

## Internal skills (meta)

### Capture Metardu conventions as skills
- Use `anthropics/skills/skill-creator` framework
- Document: Prisma schema patterns, calculator input validation, offline sync rules
- Progressive disclosure: SKILL.md ≤500 lines, references for depth
- Low priority — internal documentation, not user-facing
