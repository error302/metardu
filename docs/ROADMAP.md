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
- [ ] Cross-sections tool auto-pulls from project levelling data
  - Reuse `GET /api/project/[id]/points` (filter points with elevation along chainage)
  - `/tools/cross-sections?project=<id>` auto-populates
- [ ] Earthworks tool auto-pulls from cross-sections
  - New API: `GET /api/project/[id]/cross-sections`
  - `/tools/earthworks?project=<id>` auto-populates existing ground profiles

### Mutation plan deep integration
- [ ] Refactor `MutationPlanGenerator` to accept `initialPlots` prop
  - Currently uses sessionStorage bridge (works but fragile)
  - Clean prop injection is the right pattern

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

### Tier 2 — build when needed (real but niche)

#### Dual-surface TIN volume comparison (topographic/engineering)
**Why:** Monitoring quarries, borrow pits, base excavations. Compare baseline surface vs current surface.
**How:** Extend existing `src/lib/engine/contours.ts` `computeVolumeFromTIN` to accept two TIN surfaces. Prismoidal column equation: `V = A_base × (Δz1+Δz2+Δz3)/3`. Cut/fill heatmap overlay on OpenLayers.
**Where:** Extend `/tools/earthworks` or new `/tools/volume-comparison` (route exists)
**Effort:** 1 session (extends existing volume code)
**Status:** Not started. Note: Metardu already has `crossSectionVolume.ts` and `buildTINSurface` — this is a dual-surface extension, not a new engine.

#### Parabolic vertical curve profile designer (engineering)
**Why:** Highway alignment audit — checking crest/sag curves against stopping sight distance (SSD).
**How:** Parabolic curve equation `y = ((g2-g1)/2L)x² + g1·x + E_PVC`. K-factor check against design speed. Amber warning on failing curves.
**Where:** New `/tools/vertical-curve` or fold into as-built deviation guard as "design compliance" mode
**Effort:** 1 session
**Status:** Defer — this is a design tool, not a survey tool. Build only if targeting KeNHA highway contracts. Surveyors set out curves; they don't design them.

#### Web Worker TIN generator
**Why:** Contour generation can freeze on large datasets.
**How:** Move Delaunay triangulation + contour interpolation to Web Worker.
**Status:** Premature unless users report freezing. Current contour gen works for typical datasets.

#### Automated breakline extraction
**Why:** Auto-draw toe-of-slope, top-of-bank from TIN mesh.
**How:** Compute triangle normal vectors, flag sharp angle changes, stitch into MultiLineString.
**Status:** Nice-to-have. Most surveyors digitize breaklines in the field.

#### Spiral-to-curve alignment engine
**Why:** KeNHA highway design uses clothoid spirals.
**How:** Custom OpenLayers geometry for transition spirals. Dynamic chainage stationing.
**Status:** Niche. Build when you have a KeNHA highway contract.

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
- Individual tool pages still use old internal layouts
- Priority: traverse, levelling, COGO, deed plan (highest traffic)
- Pattern: field-book table + output diagram (from v0.1 preview)

### OKLCH color migration
- Current tokens are hex
- impeccable skill recommends OKLCH for perceptual uniformity
- Low priority — current palette works

### Prisma schema cleanup
- SurveyType union still includes 'mining' | 'hydrographic' (backward compat)
- DB tables for hydro/mining may still exist (no migration run)
- Clean up after confirming no old projects reference them

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
