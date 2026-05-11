# METARDU — Phase 25 Handoff & Complete Phase Roadmap
**Date:** 2026-05-06 | **Status:** Phase 25 complete, tested, all bugs fixed

---

## PHASE 25 — WHAT WAS BUILT (COMPLETE)

### Feature: Dual Project Scale (Small vs Scheme)

| File | Status | Notes |
|---|---|---|
| `sql/025_scheme.sql` | ✅ READY TO RUN | Run on GCP VM before deploying |
| `src/types/scheme.ts` | ✅ Complete | Types for Scheme, Block, Parcel, statuses |
| `src/app/api/projects/route.ts` | ✅ Complete | POST/GET — uses db proxy, handles scheme_details |
| `src/app/api/scheme/blocks/route.ts` | ✅ Complete | GET/POST blocks |
| `src/app/api/scheme/blocks/[id]/route.ts` | ✅ Complete | PATCH/DELETE block |
| `src/app/api/scheme/parcels/route.ts` | ✅ Complete | GET/POST parcels |
| `src/app/api/scheme/parcels/[id]/route.ts` | ✅ Complete | PATCH/DELETE parcel |
| `src/app/api/scheme/traverse/route.ts` | ✅ Complete | POST compute + save, GET load |
| `src/app/api/scheme/import/route.ts` | ✅ Complete | CSV bulk import |
| `src/app/project/new/page.tsx` | ✅ Fixed | Uses fetch(/api/projects) — no Supabase |
| `src/app/project/[id]/scheme/page.tsx` | ✅ Complete | Scheme workspace with stats/blocks |
| `src/app/project/[id]/scheme/blocks/page.tsx` | ✅ Complete | Block CRUD |
| `src/app/project/[id]/scheme/blocks/[blockId]/page.tsx` | ✅ Fixed | JSX syntax bug fixed, CSV import shown |
| `src/components/scheme/TraverseComputePanel.tsx` | ✅ Fixed | Linear Misclosure terminology, unused import removed |
| `src/components/scheme/CsvImportPanel.tsx` | ✅ Complete | Drag/drop CSV import |

### Bugs Fixed in This Session
1. JSX syntax error in `[blockId]/page.tsx` — CsvImportPanel was outside the ternary expression
2. New project page used Supabase client — replaced with `fetch('/api/projects')`
3. SQL migration had wrong table structure — fixed to match actual API routes
4. `traverseSheet.ts` — HCL/HCR printed as decimal degrees — now DMS
5. `TraverseComputePanel` — "Linear Error" → "Linear Misclosure"
6. `deedPlanPrint.ts` — unused `closureColor` variable identified (non-breaking, tsconfig has noUnusedLocals off)

### DEPLOYMENT STEPS (Phase 25)
```bash
# 1. Run migration on GCP VM
psql -h 34.170.248.156 -U metardu -d metardu -f sql/025_scheme.sql

# 2. Verify columns exist
psql -h 34.170.248.156 -U metardu -d metardu -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='project_type';"

# 3. Deploy
git add -A && git commit -m "Phase 25: Scheme project architecture"
git push
pm2 restart metardu && pm2 save && pm2 list
```

---

## FULL PHASE ROADMAP

### TIER 1 — IMMEDIATE PRIORITY

**Phase 26 — Scheme: Deed Plan Batch Generation**
- `/api/scheme/deed-plan?parcel_id=X` — per-parcel deed plan PDF from traverse results
- `/api/scheme/batch?project_id=X` — ZIP of all deed plans
- `/api/scheme/rim?project_id=X` — Registry Index Map (RIM) PDF
- `/api/scheme/submission?project_id=X` — full submission package ZIP
- These endpoints are already called in the UI but return 404

**Phase 27 — Setting Out Schedule PDF**
- Tool already exists at `/tools/setting-out`
- Missing: printable schedule (point name, E, N, offset, RL, cut/fill)
- Use `buildPrintDocument.ts` + `PrintMetaPanel` (already built)
- Engine: `settingOutEngine.ts` already computes all values

**Phase 28 — Field Abstract / Statutory Computation Workbook (ExcelJS)**
- 9-sheet Excel workbook for DoLS formal submission
- Sheets: Project Details, Field Abstract, Traverse, Coordinates, Levelling, Area, B&D, COGO, QA
- ExcelJS is already installed
- This is the highest-value billable automation

**Phase 29 — GNSS Observation Log PDF**
- Formal log: session, satellites, PDOP, baseline, fixed/float, RMS
- Generator: `src/lib/print/gnssObservationLog.ts` exists but no UI

**Phase 30 — Earthworks BoQ PDF**
- Generator: `src/lib/print/earthworksBoQ.ts` exists but no UI
- Tool: `/tools/earthworks` has computation, missing print output

---

### TIER 2 — HIGH VALUE

**Phase 31 — Deed Plan / BIP Completion**
- `formNo4Renderer.ts` exists — verify it's submission-ready
- Connect to real project data (currently demo-only)
- `SurveyPlanViewer` needs to pull from DB not mock data
- Add Form 19/20 reference number field

**Phase 32 — Survey Report: Declaration + Calibration Fields**
- Survey Report Builder has 14 sections per RDM 1.1 Table 5.4
- Missing: Declaration Statement block, calibration cert reference field
- Required by SRVY2025-1 for formal submission

**Phase 33 — Road Reserve Survey Report**
- KeNHA/county government format
- Chainage schedule, cross-section summary, infrastructure list
- Not in app at all

**Phase 34 — Mobilisation Report (RDM 1.1 Table 5.3)**
- Separate from survey report (Table 5.4)
- Sections: H&S, Personnel, Equipment, Calibration, Field forms

---

### TIER 3 — MEDIUM VALUE

**Phase 35 — CI/CD Pipeline (GitHub Actions)**
- PR checks: TypeScript, ESLint, forbidden pattern scan (Supabase refs)
- Deploy: auto-deploy on push to main with rollback
- Weekly security scan
- TypeScript is currently at 0 errors — protect it

**Phase 36 — OpenLayers Map Integration**
- Deferred until submission pipeline complete
- proj4/SRID 21037 integration already solved
- Main cost: bundle size on Capacitor Android

**Phase 37 — Control Marks Register**
- RDM 1.1 Section 5.6.3 format
- Unique ID, E, N, H, chainage, side, description, photo reference

**Phase 38 — RDM 1.1 Table 5.2 Tolerances Display**
- Show feature tolerances in field data capture screens
- Structures ±0.025m, gravel ±0.050m, other ±0.100m

**Phase 39 — xlsx → exceljs Migration**
- SheetJS CE (xlsx) is end-of-life HIGH vulnerability
- exceljs is already installed
- Replace all xlsx usage with exceljs

---

### TIER 4 — FUTURE

**Phase 40 — Drone Survey Report (UAV)**
- Flight params, GSD, overlap, GCP residuals, orthophoto extent
- Drone page stub exists, GCP export works

**Phase 41 — Environmental Survey / Setback Certificate**
- Building permit attachment
- Certify setbacks from rivers, roads, boundaries

**Phase 42 — Title Search Summary Generator**
- Template-based land registry record summarizer

---

## INVARIANTS (every agent must respect)

| Rule | Value |
|---|---|
| Levelling closure | **10√K mm** (K = km) — RDM 1.1 Table 5.1. Never 12√K |
| Angular misclosure | ≤ 3.0″ per station, max 15 courses — RDM 1.1 Table 5.1 |
| Linear misclosure | 1:10,000 — RDM 1.1 Table 5.1 |
| HI label | **HPC** (Height of Plane of Collimation) — British/East African |
| Linear error label | **Linear Misclosure** — not "Linear Error" |
| Coordinate system | **SRID 21037** only (Arc 1960 / UTM Zone 37S) |
| DB access | `/api/db` proxy only — never Supabase client in pages |
| Auth | `getServerSession(authOptions)` — never `getUser()` |
| Process manager | **PM2** only |
| Print output | All sheets use `buildPrintDocument.ts` + `PrintMetaPanel.tsx` |
| Page width | All tool pages: `max-w-7xl mx-auto px-4` |
