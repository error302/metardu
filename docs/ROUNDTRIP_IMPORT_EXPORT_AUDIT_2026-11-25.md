# Import → Export Round‑Trip Audit (CRS + Tolerance Profiles)

Date: 2026‑11‑25
Scope: read‑only audit of the topographic import/export surface and the
tolerance‑profile plumbing, against the external blueprint
`METARDU_WEB_PROFESSIONAL_SURVEY_BLUEPRINT.md` §8 (Topographic workspace) and
§16 (Tolerance profiles).

Blueprint requirements used verbatim:

- §16: "Tolerances must be versioned data, not scattered constants." A profile
  carries Name, Client/Contract/Jurisdiction, Version, Rules, Effective Date,
  Source, Approved By. "Every QA PASS/FAIL references the tolerance profile
  revision used."
- §8: workflow `Control → Observe/import → Code features → QA points → Build
  linework → Build breaklines → Build TIN → Review → Contours → Topo plan →
  Deliver`; "Editing linework must not mutate raw observations."

## CRS round‑trip

### Exports that embed the CRS (self‑describing, fail closed)

| Format | CRS carrier | Fail‑closed on undeclared | Evidence |
| --- | --- | --- | --- |
| GeoJSON | WGS84 geometry + `utm_zone` property + ISO 19115 metadata | yes | `src/lib/export/generateGeoJSON.ts:38-50`; `src/app/api/compute/export/geojson/route.ts:110-119` |
| LandXML | CRS + vertical attrs | yes | `src/app/api/project/[id]/export/route.ts:296-344` |
| Shapefile | `.prj` WKT | yes (throws on undeclared datum) | `src/lib/export/shapefile.ts:369-415`; `src/lib/export/generateShapefile.ts:42-44` |
| DXF (traverse) | prints declared CRS / NOT DECLARED | yes | `src/app/api/compute/export/traverse-dxf/route.ts` |

### Exports that do NOT embed the CRS

- Coordinate‑schedule **CSV** columns are `point_name,easting,northing,elevation,type`
  — no EPSG / zone / datum (`src/app/api/project/[id]/export/route.ts:103-115`).
  A re‑import cannot recover the CRS from the file.

### Import side

- **Point import (CSV)** is the strong path. The request carries `sourceCrs`,
  `coordinateUnit`, `heightUnit`, and `expectedReferenceHash` bound to the
  project's declared reference; it refuses display‑only CRS (e.g. EPSG:3857)
  and an undeclared project CRS, and stores `source_crs` plus
  `horizontal_crs/datum/utm_zone/hemisphere`
  (`src/lib/import/pointImport.ts:38,86`; `src/lib/import/pointImportServer.ts:53-70`;
  tests `src/lib/import/__tests__/pointImport.test.ts:33-34`).
- **Topo import** validates imported points against the project CRS only
  (`src/app/api/topo/import/route.ts:62-77`).
- **Fieldbook import/commit** records angles/distances and `relativePrecision`
  but no CRS and no tolerance profile (`src/app/api/import/commit/route.ts`).

### GAP (CRS)

No import path consumes the CRS embedded in a GeoJSON/LandXML/Shapefile/DXF
export. "Export → re‑import → same CRS" therefore holds only when the operator
re‑declares the source CRS (point‑import's `expectedReferenceHash`) or the
target project is already declared identically. The file's own embedded CRS is
not read back. CSV is the weakest link (no CRS at all).

## Tolerance‑profile round‑trip (§16)

### Database path is versioned and compliant

- `tolerance_profiles(id, name, jurisdiction, version, rules JSONB, is_default,
  created_by, created_at, updated_at)` — `src/lib/db/migrations/068_background_jobs_and_observation_batches.sql:112-123`.
- `project_tolerance_profiles(project_id → tolerance_profile_id, assigned_by,
  assigned_at)` — `src/lib/db/migrations/072_deliverables_computations_qa.sql:134-139`.
- `qa_runs(tolerance_profile_id, tolerance_profile_version, …)` and
  `qa_results(result PASS/WARN/FAIL/INFO, measured_value, threshold_value, unit)`
  — `072_…sql:96-124`. A PASS is attributed to the profile revision that judged it.
- Set‑out writes `tolerance_profile_id` + `tolerance_version`
  (`src/app/api/project/[id]/setout/route.ts:1217,1282-1283`);
  `src/lib/provenance/computationAndQa.ts:143-170` joins the project profile.

### GAPS (tolerance)

1. **No export/import file carries the tolerance profile id/version.** It is
   never written to GeoJSON/CSV/DXF/LandXML/Shapefile and never read on import,
   so the tolerance profile is not round‑tripped through the file interchange.
2. **`src/lib/validation/toleranceEngine.ts` is the "scattered constants" §16
   forbids.** It uses a hard‑coded 3‑value enum `cadastral | engineering |
   control` with hard‑coded `linearPrecision / angularMisclosure /
   closingErrorMmPerKm` (`toleranceEngine.ts:11-62`). Its result carries only
   the enum `profile`, not a DB id/version/source/approved_by/effective_date.
   Any PASS/FAIL surfaced from this engine (outside `qa_runs`) is unattributed
   to a versioned revision.
3. The seeded profile hard‑codes `jurisdiction DEFAULT 'KENYA_CAP_299'` and
   Kenya regulations (`068_…sql:115,128-146`) — a seed default, not a
   per‑request silent default, but relevant to multi‑jurisdiction use.

## Net result

- The **database QA path is §16‑compliant** (versioned profiles; PASS/FAIL
  reference the revision).
- The **file interchange is not**: no CRS read‑back on import, and the
  tolerance profile never appears in any exported file.
- The **in‑memory tolerance engine is a parallel, non‑versioned system** that
  should either be backed by `tolerance_profiles` or clearly marked as a
  non‑authoritative pre‑check.

## Recommended follow‑ups (not implemented here)

1. Write the CRS (EPSG code) and the tolerance `profile_id` + `version` into the
   export envelope (e.g. a sidecar manifest or CSV header comment) and read them
   back on import, binding to the target project reference by hash.
2. Route `toleranceEngine.checkTolerance` through `tolerance_profiles` (or have
   it return the DB profile id/version it used) so no PASS/FAIL is unattributed.
3. Make the seeded profile jurisdiction explicit per project rather than a
   single `KENYA_CAP_299` default.