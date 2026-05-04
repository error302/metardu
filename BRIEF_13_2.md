# METARDU Brief 13.2 — Traverse Angular Misclosure (RDM 1.1 Table 5.1)
**Status:** READY TO IMPLEMENT  
**Priority:** CRITICAL — required by RDM 1.1 Table 5.1  
**Depends on:** Brief 13.1 (buildPrintDocument must exist first)  
**References:** RDM 1.1 (2025) Table 5.1

---

## CONTEXT

RDM 1.1 (2025) Table 5.1 specifies TWO accuracy requirements for traverses:
1. **Position misclosure** (linear): 1/10,000 — currently computed ✅
2. **Azimuth misclosure**: ≤ 3.0 arc-seconds per station, max 15 courses between checks ❌ missing

A traverse computation without angular misclosure is incomplete for formal survey submissions in Kenya.

---

## HARD RULES

- Angular computation only runs if user provides **both** initial and closing bearing — otherwise gracefully show a placeholder card
- Show: Total misclosure (seconds), per-station misclosure (seconds), Pass/Fail vs 3.0"/station
- Course count warning if legs > 15 (max 15 without an intermediate azimuth check)
- **Never change existing Bowditch/Transit computation** — this is additive only

---

## TASK 1 — Add Azimuth Input State

**File:** `src/app/tools/traverse/page.tsx`

Add to state:
```tsx
const [initialBearing, setInitialBearing] = useState({ d: '', m: '', s: '' })
const [closingBearing, setClosingBearing] = useState({ d: '', m: '', s: '' })
const [azmResult, setAzmResult] = useState<AzmResult | null>(null)

interface AzmResult {
  totalMisclosureSec: number
  misclosurePerStationSec: number
  numStations: number
  passes: boolean
  numCourses: number
  coursesWarning: boolean
}
```

---

## TASK 2 — Azimuth UI Panel

Add inside the existing traverse card, below the leg table, above the Calculate button:

```tsx
<div className="border-t border-[var(--border-color)] mt-4 pt-4">
  <h3 className="text-sm font-semibold mb-3">
    Angular Misclosure Check
    <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
      RDM 1.1 Table 5.1 — ≤ 3.0″ per station | max 15 courses
    </span>
  </h3>
  <div className="grid grid-cols-2 gap-4 mb-2">
    {[
      ['Initial Reference Bearing (WCB)', initialBearing, setInitialBearing] as const,
      ['Computed Closing Bearing (WCB)', closingBearing, setClosingBearing] as const,
    ].map(([label, val, setVal]) => (
      <div key={label}>
        <label className="block text-xs text-[var(--text-muted)] mb-1">{label}</label>
        <div className="flex items-center gap-1">
          <input className="input w-12 text-center text-xs" placeholder="DDD" value={val.d} onChange={e => setVal(p => ({...p, d: e.target.value}))} />
          <span className="text-[var(--text-muted)] text-xs">°</span>
          <input className="input w-10 text-center text-xs" placeholder="MM" value={val.m} onChange={e => setVal(p => ({...p, m: e.target.value}))} />
          <span className="text-[var(--text-muted)] text-xs">'</span>
          <input className="input w-12 text-center text-xs" placeholder="SS.ss" value={val.s} onChange={e => setVal(p => ({...p, s: e.target.value}))} />
          <span className="text-[var(--text-muted)] text-xs">"</span>
        </div>
      </div>
    ))}
  </div>
  <p className="text-xs text-[var(--text-muted)]">
    Optional — enter the initial and closing reference bearings. Leave blank if no closing azimuth check was performed.
  </p>
</div>
```

---

## TASK 3 — Compute Angular Misclosure

Add helper function (outside component or in a lib file):

```typescript
function computeAzmMisclosure(
  initD: string, initM: string, initS: string,
  closeD: string, closeM: string, closeS: string,
  numStations: number
): AzmResult | null {
  const iD = parseFloat(initD), iM = parseFloat(initM), iS = parseFloat(initS)
  const cD = parseFloat(closeD), cM = parseFloat(closeM), cS = parseFloat(closeS)
  if (isNaN(iD) || isNaN(cD)) return null
  
  const initialDeg = iD + iM / 60 + iS / 3600
  const closingDeg = cD + cM / 60 + cS / 3600
  
  let diffSec = Math.abs(initialDeg - closingDeg) * 3600
  // Handle wrap-around at 360°
  if (diffSec > 648000) diffSec = 1296000 - diffSec
  
  const perStation = numStations > 0 ? diffSec / numStations : 0
  
  return {
    totalMisclosureSec: diffSec,
    misclosurePerStationSec: perStation,
    numStations,
    passes: perStation <= 3.0,
    numCourses: numStations,
    coursesWarning: numStations > 15,
  }
}
```

Call at end of `calculate()`:
```typescript
if (initialBearing.d && closingBearing.d) {
  setAzmResult(computeAzmMisclosure(
    initialBearing.d, initialBearing.m, initialBearing.s,
    closingBearing.d, closingBearing.m, closingBearing.s,
    legs.length
  ))
} else {
  setAzmResult(null)
}
```

---

## TASK 4 — Display Results Card

Add in results grid alongside the existing accuracy card:

```tsx
{/* Angular Misclosure Card */}
{azmResult ? (
  <div className="card">
    <div className="card-header flex justify-between items-center">
      <span className="label">Angular Misclosure — RDM 1.1 Table 5.1</span>
      <span className={`badge ${azmResult.passes ? 'badge-success' : 'badge-error'}`}>
        {azmResult.passes ? 'PASSES' : 'FAILS'}
      </span>
    </div>
    <div className="card-body space-y-3">
      <ResultRow label="Stations" value={String(azmResult.numStations)} />
      <ResultRow label="Total Misclosure" value={`${azmResult.totalMisclosureSec.toFixed(1)}″`} />
      <ResultRow label="Misclosure per Station" value={`${azmResult.misclosurePerStationSec.toFixed(2)}″`} highlight />
      <ResultRow label="Allowable (RDM 1.1 Table 5.1)" value="≤ 3.0″ per station" />
      {azmResult.coursesWarning && (
        <div className="rounded p-3 bg-amber-900/20 border border-amber-700 text-xs text-amber-300">
          ⚠️ {azmResult.numCourses} courses — RDM 1.1 requires an azimuth check every 15 courses maximum.
        </div>
      )}
      <div className={`mt-3 p-3 rounded-lg text-center ${azmResult.passes ? 'bg-emerald-900/20 border border-emerald-700' : 'bg-red-900/20 border border-red-700'}`}>
        <p className="text-xs text-[var(--text-muted)] mb-1">RDM 1.1 TABLE 5.1 — AZIMUTH CHECK</p>
        <p className={`font-bold text-sm ${azmResult.passes ? 'text-emerald-400' : 'text-red-400'}`}>
          {azmResult.misclosurePerStationSec.toFixed(2)}″/station — {azmResult.passes ? 'ACCEPTABLE ≤ 3.0″' : 'EXCEEDS 3.0″ LIMIT'}
        </p>
      </div>
    </div>
  </div>
) : result ? (
  <div className="card border-dashed opacity-60">
    <div className="card-body text-center py-6">
      <p className="text-xs text-[var(--text-muted)]">Enter initial and closing bearings above to compute angular misclosure</p>
      <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">RDM 1.1 Table 5.1 — ≤ 3.0″ per station required</p>
    </div>
  </div>
) : null}
```

---

## TASK 5 — Include in Print Output

In the traverse print body HTML (from Brief 13.1), append after the coordinate table:

```typescript
const azmSection = azmResult ? `
<h2>Angular Misclosure — RDM 1.1 Table 5.1</h2>
<div class="summary-box">
  <div class="summary-row"><span>Number of Stations</span><span class="mono">${azmResult.numStations}</span></div>
  <div class="summary-row"><span>Total Misclosure</span><span class="mono">${azmResult.totalMisclosureSec.toFixed(1)}″</span></div>
  <div class="summary-row"><span>Misclosure per Station</span><span class="mono">${azmResult.misclosurePerStationSec.toFixed(2)}″</span></div>
  <div class="summary-row"><span>Allowable (RDM 1.1 Table 5.1)</span><span class="mono">≤ 3.0″ per station, max 15 courses</span></div>
  <div class="summary-row"><span>Status</span><span class="${azmResult.passes ? 'pass' : 'fail'}">${azmResult.passes ? 'ACCEPTABLE' : 'EXCEEDS TOLERANCE'}</span></div>
  ${azmResult.coursesWarning ? '<div class="summary-row" style="color:#b45309">⚠ Intermediate azimuth check required (>15 courses)</div>' : ''}
</div>` : `
<h2>Angular Misclosure</h2>
<p style="color:#666;font-size:9pt;font-style:italic">No closing azimuth provided. RDM 1.1 Table 5.1 requires this check for formal survey submissions.</p>`
```

---

## TEST CASES

1. Initial `045°32'08"`, closing `045°32'22"` → total 14.0″, 7 stations → 2.0″/station → PASSES
2. Initial `045°32'08"`, closing `045°33'08"` → total 60.0″, 7 stations → 8.57″/station → FAILS
3. Traverse with 16 legs → yellow warning about 15-course limit appears
4. Leave bearing fields blank → placeholder card shown (not the result card)
5. Print output includes angular misclosure section with correct values
6. TypeScript compiles with zero new errors

## SQL MIGRATIONS
None.

## FILES TOUCHED
- `src/app/tools/traverse/page.tsx` (EDIT — azimuth inputs, computation, display, print)
