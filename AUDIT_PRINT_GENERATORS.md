# METARDU Print Generators — Audit Report
**Date:** 2026-05-05  
**Auditor:** Full source-level review of all 9 print generators + 2 UI components  
**Scope:** `src/lib/print/` + `src/components/setting-out/StakeOutSheet.tsx`

---

## Verdict Summary

| File | Status | Issues |
|---|---|---|
| `buildPrintDocument.ts` | ✅ CLEAN | Shared template — no issues |
| `beaconCertificate.ts` | ✅ CLEAN | Types self-contained, all fields correct |
| `settingOutSchedule.ts` | ✅ CLEAN | HzAngle/VA already DMS from engine |
| `gnssObservationLog.ts` | ✅ CLEAN | All field refs verified |
| `earthworksBoQ.ts` | ✅ CLEAN | All refs verified vs earthworksEngine.ts |
| `deedPlanPrint.ts` | ⚠️ MINOR | `closureColor` unused var (no runtime impact — tsconfig has `noUnusedLocals` off) |
| `traverseSheet.ts` | 🔴 FIXED | HCL/HCR were decimal degrees — now DMS |
| `StakeOutSheet.tsx` | ⚠️ TRIVIAL | `station` prop declared but not destructured |
| `BeaconCertificateBuilder.tsx` | ✅ CLEAN | |

---

## Bug 1 — FIXED: `traverseSheet.ts` — HCL/HCR in decimal degrees

**Was:**
```typescript
<td class="right mono">${fmtN(o.hcl)}</td>   // showed: 045.536
<td class="right mono">${fmtN(o.hcr)}</td>   // showed: 225.541
```

**Now:**
```typescript
<td class="right mono">${decToDMS(o.hcl)}</td>   // shows: 045°32'07.8"
<td class="right mono">${decToDMS(o.hcr)}</td>   // shows: 225°32'27.8"
```

A `decToDMS()` helper was added. DoLS expects horizontal circle readings in DMS on computation sheets.

---

## Bug 2 — KNOWN MINOR: `deedPlanPrint.ts` — `closureColor` unused

```typescript
const closureColor = closure.passes ? '#14532d' : '#7f1d1d'  // defined, never used
```

The CSS classes `closure-pass`/`closure-fail` handle the colour via stylesheet. No runtime impact.  
**tsconfig.json** has `strict: false` and no `noUnusedLocals`, so this is a zero-impact code smell.  
Fix: remove the line when editing the file for any other reason.

---

## Type Verification — All Engines

### `settingOutEngine.ts` → `settingOutSchedule.ts`
- `SettingOutRow.HzAngle: string` — DMS from engine ✅
- `SettingOutRow.VA: string` — DMS from engine ✅  
- `SettingOutRow.HD`, `.SD`, `.TH`, `.heightDiff`, `.designE/N/RL` ✅
- `SettingOutResult.instrumentStation.rl`, `.ih` ✅
- No double-quote bug on HzAngle — the `"` is inside the string, not JSX attribute ✅

### `traverseEngine.ts` → `traverseSheet.ts`
- `ReducedObservation.hcl/hcr` are decimal degrees ← **was the root cause of Bug 1**
- `TraverseComputationResult` all 17 fields verified ✅
- `meanAngleDMS`, `wcbDMS` are DMS strings from engine ✅

### `earthworksEngine.ts` → `earthworksBoQ.ts`
- `CrossSectionComputed`: `chainage`, `centrelineRL`, `formationRL`, `centreHeight`, `mode`, `cutArea`, `fillArea` ✅
- `EarthworkResult`: `legs`, `totalCutEndArea/Fill`, `totalCutPrismoidal/Fill`, `shrinkageFactor`, `adjustedCut`, `massOrdinates` ✅
- `RoadTemplate`: `carriagewayWidth`, `shoulderWidth`, `camber`, `cutSlopeH`, `fillSlopeH` ✅
- `VolumeLeg`: all 12 fields used in generator match engine ✅

### `deedPlan.ts` → `deedPlanPrint.ts`
- `DeedPlanInput`, `BoundaryPoint`, `BoundaryLeg` all from `@/types/deedPlan` ✅
- `computeBoundaryLegs`, `computeArea`, `computeClosureCheck` from `@/lib/compute/deedPlan` ✅
- `ClosureCheck.passes: boolean`, `.precisionRatio: string`, `.perimeter: number` ✅
- `degreesToDMS` import correctly removed ✅

---

## Design Note — PrintMeta Type Split

`gnssObservationLog.ts` and `earthworksBoQ.ts` import `PrintMeta` from `buildPrintDocument`  
(which has `title: string` as a required field).

When UI components are built for these two generators, they should:
```typescript
// Pass meta from PrintMetaPanel plus an explicit title:
generateGNSSObservationLog({ 
  ...otherFields,
  meta: { ...printMetaPanelMeta, title: 'GNSS Observation Log' }
})
```

All other generators already handle this correctly via spread + title override.

---

## Decisions Reviewed

## Follow-up Audit - 2026-05-05

The `cutFillDisplay` removal was technically safe because it was dead code: nothing called it and the setting-out engine does not contain ground-level-vs-design-level data for earthworks cut/fill. Re-introducing it as "cut/fill" would be misleading. The valuable real-world field on a setting-out sheet is `VD`, the vertical difference used for total-station setup: `(Design RL + TH) - (Station RL + IH)`.

### Additional fixes applied

| File | Fix |
|---|---|
| `SettingOutTable.tsx` | Removed the extra quote after `HzAngle`; added `VD (m)` column |
| `StakeOutSheet.tsx` | Added `VD (m)` column and corrected preview text |
| `settingOutSchedule.ts` | Added `VD (m)` to formal print output, clarified that it is not earthworks cut/fill, escaped free-text job notes |
| `buildPrintDocument.ts` | Escaped shared print-header values so project/client/surveyor text cannot break generated HTML |
| `beaconCertificate.ts` | Escaped location/beacon free text and made coordinate formatting robust against invalid numeric strings |

### Verification

- Local TypeScript check passed: `.\node_modules\.bin\tsc.cmd --noEmit --pretty false`
- Production build compiled and generated static pages, then failed on unrelated existing app/runtime issues:
  - Redis unavailable on `127.0.0.1:6379` / `::1:6379`
  - `/mobile/field` uses `useSearchParams()` without a Suspense boundary
  - `/projects/new` hits `location is not defined` during prerender
- Graphify refresh could not complete in this environment:
  - `python3` command is not available on Windows
  - `python` exists, but `graphify` is not installed
  - `graphify-out/GRAPH_REPORT.md` is missing from this checkout

---

| Decision by previous agent | Correct? |
|---|---|
| Removed `degreesToDMS` import from `deedPlanPrint.ts` | ✅ Correct — it was unused |
| Removed `cutFillDisplay` from `settingOutSchedule.ts` | ✅ Correct — was unused |
| Used `buildPrintDocument.PrintMeta` in generators, `PrintMetaPanel.PrintMeta` in UIs | ✅ Correct pattern — compatible via spreading |
| `StakeOutSheet.tsx` `station` prop unused in body | ⚠️ Minor — no fix required (data available via `result.instrumentStation`) |
| HCL/HCR as decimal degrees in `traverseSheet.ts` | ❌ Wrong — fixed in this audit |
