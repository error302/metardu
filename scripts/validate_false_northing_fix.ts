/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * False Northing Fix — Validation Benchmark
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * After fixing 56 sheets that had missing 10,000,000m false northing offset
 * in national_sheet_corners.json, this benchmark:
 *
 *   1. Loads the FIXED national_sheet_corners.json
 *   2. Computes Helmert 4-params for each sheet from its 4 corners
 *   3. Tests accuracy by converting Cassini corners → UTM via Helmert
 *   4. Compares against known UTM coordinates
 *   5. Reports per-sheet RMSE, overall statistics, and identifies the
 *      previously-affected Zone 36 sheets
 *
 * Run:  npx tsx scripts/validate_false_northing_fix.ts
 */

import nationalSheetCornersData from '../data/cassini/national_sheet_corners.json'
import {
  computeHelmert4Params,
  computeABCoefficients,
  cassiniFeetToUTM,
  applyConformalCorrection,
  type TopoSheetParams,
  type CommonPoint,
} from '../src/lib/geo/cassini'

// ─── Type Definitions ───────────────────────────────────────────────────

interface SheetCorner {
  id: string
  utmE: number
  utmN: number
  cassE: number | null
  cassN: number | null
}

interface SheetData {
  corners: SheetCorner[]
}

interface NationalSheetCornersJSON {
  metadata: {
    source: string
    sheet_count: number
    subsheet_count: number
    utm_to_cassini_sheet_count: number
    empty_placeholder_sheets: string[]
    extracted_date: string
    corner_order: string
    units: {
      cassE: string
      cassN: string
      utmE: string
      utmN: string
    }
    notes: string[]
  }
  sheets: Record<string, SheetData>
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const SEP = '='.repeat(80)
const SEP_THIN = '-'.repeat(72)

function fmt(n: number, decimals = 4): string {
  return n.toFixed(decimals)
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

function padStart(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str
}

/**
 * Detect if a sheet was in Zone 36 (utmE typically < 500,000 for zone 36)
 */
function isZone36(utmE: number): boolean {
  return utmE < 500000
}

/**
 * Check if sheet had the false northing bug (utmN in the uncorrected range < 5M).
 * After fix, ALL sheets should have utmN >= ~9,900,000 (south Kenya with false northing).
 */
function hadFalseNorthingBug(corners: SheetCorner[]): boolean {
  // After fix, utmN should be ~9.9M-10.5M for southern Kenya sheets
  // Sheets that HAD the bug would have had utmN < 5M before the fix
  // After fix they're all > 10M. But we can detect by checking if utmN is in the
  // "high" range (10M+) which is consistent with false northing applied.
  // The actual affected sheets were Zone 36 ones. Let's detect:
  // Before fix: utmN was ~55,000-276,000 (no 10M offset)
  // After fix:  utmN is ~10,027,000-10,055,000 (with 10M offset)
  return corners.every(c => c.utmN >= 9_500_000) && corners.some(c => isZone36(c.utmE))
}

// ─── Main Benchmark ──────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════════════════════╗')
console.log('║  FALSE NORTHING FIX — VALIDATION BENCHMARK                                ║')
console.log('║  Testing all national sheet Helmert params after 10M false N correction   ║')
console.log('╚══════════════════════════════════════════════════════════════════════════╝')

const raw = nationalSheetCornersData as unknown as NationalSheetCornersJSON
const emptyPlaceholders = new Set(raw.metadata.empty_placeholder_sheets)

interface BenchmarkResult {
  sheetId: string
  hasValidCassini: boolean
  isZone36: boolean
  hadBug: boolean
  helmertParams: {
    P: number
    Q: number
    Cx: number
    Cy: number
    A?: number
    B?: number
  } | null
  rmseMM: number
  maxErrorMM: number
  perCornerErrors: { corner: string; dE: number; dN: number; total: number }[]
  skipped: string
}

const results: BenchmarkResult[] = []
let totalValid = 0
let totalSkipped = 0
let totalErrors = 0

const sheetEntries = Object.entries(raw.sheets)

for (const [sheetId, sheetData] of sheetEntries) {
  const result: BenchmarkResult = {
    sheetId,
    hasValidCassini: false,
    isZone36: false,
    hadBug: false,
    helmertParams: null,
    rmseMM: 0,
    maxErrorMM: 0,
    perCornerErrors: [],
    skipped: '',
  }

  // Skip known empty placeholders
  if (emptyPlaceholders.has(sheetId)) {
    result.skipped = 'empty placeholder'
    results.push(result)
    totalSkipped++
    continue
  }

  // Skip sheets without valid Cassini coords
  if (!sheetData.corners || sheetData.corners.length !== 4) {
    result.skipped = 'invalid corner count'
    results.push(result)
    totalSkipped++
    continue
  }

  const hasNullCassini = sheetData.corners.some(
    c => c.cassE === null || c.cassN === null || !isFinite(c.cassE) || !isFinite(c.cassN)
  )
  if (hasNullCassini) {
    result.skipped = 'null Cassini coords'
    results.push(result)
    totalSkipped++
    continue
  }

  result.hasValidCassini = true

  // Detect Zone 36
  const avgUtmE = sheetData.corners.reduce((s, c) => s + c.utmE, 0) / 4
  result.isZone36 = isZone36(avgUtmE)

  // Detect previously-bugged sheets (Zone 36 with high utmN = now fixed)
  result.hadBug = hadFalseNorthingBug(sheetData.corners) && result.isZone36

  // Build common points from 4 corners
  const labels = ['C1', 'C2', 'C3', 'C4']
  const commonPoints: CommonPoint[] = sheetData.corners.map((c, i) => ({
    station: labels[i],
    cassN: c.cassN!,
    cassE: c.cassE!,
    utmN: c.utmN,
    utmE: c.utmE,
  }))

  try {
    // Compute Helmert 4 params
    const helmert = computeHelmert4Params(commonPoints)

    const params: TopoSheetParams = {
      id: sheetId,
      name: `Sheet ${sheetId}`,
      description: `Validation benchmark for ${sheetId}`,
      P: helmert.P,
      Q: helmert.Q,
      Cx: helmert.Cx,
      Cy: helmert.Cy,
      commonPoints,
    }

    // Compute A/B polynomial
    const ab = computeABCoefficients(params)
    if (ab) {
      params.A = ab.A
      params.B = ab.B
    }

    result.helmertParams = {
      P: params.P,
      Q: params.Q,
      Cx: params.Cx,
      Cy: params.Cy,
      A: params.A,
      B: params.B,
    }

    // Test: convert each Cassini corner → UTM via Helmert, compare with known UTM
    let sumSqError = 0
    for (let i = 0; i < 4; i++) {
      const c = sheetData.corners[i]
      const conversion = cassiniFeetToUTM(
        [{ easting: c.cassE!, northing: c.cassN! }],
        params,
      )[0]

      const dE = conversion.utmE - c.utmE
      const dN = conversion.utmN - c.utmN
      const total = Math.sqrt(dE * dE + dN * dN)

      result.perCornerErrors.push({
        corner: c.id,
        dE,
        dN,
        total,
      })

      sumSqError += dE * dE + dN * dN
      result.maxErrorMM = Math.max(result.maxErrorMM, total * 1000)
    }

    result.rmseMM = Math.sqrt(sumSqError / 4) * 1000
    totalValid++
  } catch (err) {
    result.skipped = `compute error: ${err instanceof Error ? err.message : String(err)}`
    totalErrors++
  }

  results.push(result)
}

// ─── Report ──────────────────────────────────────────────────────────────

console.log(`\n${SEP}`)
console.log(`  DATASET OVERVIEW`)
console.log(SEP)
console.log(`  Source: ${raw.metadata.source}`)
console.log(`  Extracted: ${raw.metadata.extracted_date}`)
console.log(`  Total sheets in JSON: ${sheetEntries.length}`)
console.log(`  Empty placeholders skipped: ${emptyPlaceholders.size}`)
console.log(`  UTM-only / null Cassini skipped: ${results.filter(r => r.skipped === 'null Cassini coords').length}`)
console.log(`  Compute errors: ${totalErrors}`)
console.log(`  Sheets processed: ${totalValid}`)
console.log()

// Zone distribution
const zone36Sheets = results.filter(r => r.isZone36 && r.hasValidCassini)
const zone37Sheets = results.filter(r => !r.isZone36 && r.hasValidCassini)
console.log(`  Zone 37 sheets (utmE > 500k): ${zone37Sheets.length}`)
console.log(`  Zone 36 sheets (utmE < 500k): ${zone36Sheets.length}`)

// ─── Overall Accuracy ─────────────────────────────────────────────────────

console.log(`\n${SEP}`)
console.log(`  OVERALL ACCURACY (all ${totalValid} valid sheets)`)
console.log(SEP)

const validResults = results.filter(r => r.helmertParams !== null)
const allRmse = validResults.map(r => r.rmseMM)
const allMax = validResults.map(r => r.maxErrorMM)

const avgRmse = allRmse.reduce((a, b) => a + b, 0) / allRmse.length
const maxRmse = Math.max(...allRmse)
const minRmse = Math.min(...allRmse)
const medianRmse = allRmse.sort((a, b) => a - b)[Math.floor(allRmse.length / 2)]
const avgMax = allMax.reduce((a, b) => a + b, 0) / allMax.length
const p95Rmse = allRmse[Math.floor(allRmse.length * 0.95)]

// Grade distribution
const grades: Record<string, number> = {
  'EXCELLENT (<1m)': 0,
  'GOOD (1-3m)': 0,
  'MODERATE (3-5m)': 0,
  'LOW (5-10m)': 0,
  'POOR (>10m)': 0,
}

for (const rmse of allRmse) {
  if (rmse < 1000) grades['EXCELLENT (<1m)']++
  else if (rmse < 3000) grades['GOOD (1-3m)']++
  else if (rmse < 5000) grades['MODERATE (3-5m)']++
  else if (rmse < 10000) grades['LOW (5-10m)']++
  else grades['POOR (>10m)']++
}

console.log()
console.log(`  RMSE statistics (across 4 corners per sheet):`)
console.log(`    Average RMSE:    ${avgRmse.toFixed(1).padStart(10)} mm  (${(avgRmse/1000).toFixed(3)} m)`)
console.log(`    Median RMSE:    ${medianRmse.toFixed(1).padStart(10)} mm  (${(medianRmse/1000).toFixed(3)} m)`)
console.log(`    Min RMSE:       ${minRmse.toFixed(1).padStart(10)} mm  (${(minRmse/1000).toFixed(3)} m)`)
console.log(`    Max RMSE:       ${maxRmse.toFixed(1).padStart(10)} mm  (${(maxRmse/1000).toFixed(3)} m)`)
console.log(`    P95 RMSE:       ${p95Rmse.toFixed(1).padStart(10)} mm  (${(p95Rmse/1000).toFixed(3)} m)`)
console.log(`    Avg Max Error:  ${avgMax.toFixed(1).padStart(10)} mm  (${(avgMax/1000).toFixed(3)} m)`)
console.log()

console.log(`  Grade distribution:`)
for (const [grade, count] of Object.entries(grades)) {
  const pct = (count / allRmse.length * 100).toFixed(1)
  const bar = '\u2588'.repeat(Math.round(count / allRmse.length * 40))
  console.log(`    ${padEnd(grade, 20)} ${bar} ${count.toString().padStart(4)} (${pct}%)`)
}

// ─── Zone 36 (previously affected) vs Zone 37 comparison ──────────────────

console.log(`\n${SEP}`)
console.log(`  ZONE 36 vs ZONE 37 COMPARISON`)
console.log(SEP)

if (zone36Sheets.length > 0 && zone36Sheets.some(r => r.helmertParams)) {
  const z36valid = zone36Sheets.filter(r => r.helmertParams)
  const z36rmse = z36valid.map(r => r.rmseMM)
  const z36avg = z36rmse.reduce((a, b) => a + b, 0) / z36rmse.length
  const z36max = Math.max(...z36rmse)
  const z36median = z36rmse.sort((a, b) => a - b)[Math.floor(z36rmse.length / 2)]

  console.log()
  console.log(`  Zone 36 (${z36valid.length} sheets with valid Cassini):`)
  console.log(`    Average RMSE: ${z36avg.toFixed(1).padStart(10)} mm  (${(z36avg/1000).toFixed(3)} m)`)
  console.log(`    Median RMSE:  ${z36median.toFixed(1).padStart(10)} mm  (${(z36median/1000).toFixed(3)} m)`)
  console.log(`    Max RMSE:     ${z36max.toFixed(1).padStart(10)} mm  (${(z36max/1000).toFixed(3)} m)`)

  // Count Zone 36 sheets that are now < 5m (good)
  const z36good = z36rmse.filter(r => r < 5000).length
  const z36bad = z36rmse.filter(r => r >= 5000).length
  console.log(`    Sheets < 5m RMSE: ${z36good}/${z36valid.length}`)
  console.log(`    Sheets >= 5m RMSE: ${z36bad}/${z36valid.length}`)
}

if (zone37Sheets.length > 0 && zone37Sheets.some(r => r.helmertParams)) {
  const z37valid = zone37Sheets.filter(r => r.helmertParams)
  const z37rmse = z37valid.map(r => r.rmseMM)
  const z37avg = z37rmse.reduce((a, b) => a + b, 0) / z37rmse.length
  const z37max = Math.max(...z37rmse)
  const z37median = z37rmse.sort((a, b) => a - b)[Math.floor(z37rmse.length / 2)]

  console.log()
  console.log(`  Zone 37 (${z37valid.length} sheets with valid Cassini):`)
  console.log(`    Average RMSE: ${z37avg.toFixed(1).padStart(10)} mm  (${(z37avg/1000).toFixed(3)} m)`)
  console.log(`    Median RMSE:  ${z37median.toFixed(1).padStart(10)} mm  (${(z37median/1000).toFixed(3)} m)`)
  console.log(`    Max RMSE:     ${z37max.toFixed(1).padStart(10)} mm  (${(z37max/1000).toFixed(3)} m)`)

  const z37good = z37rmse.filter(r => r < 5000).length
  const z37bad = z37rmse.filter(r => r >= 5000).length
  console.log(`    Sheets < 5m RMSE: ${z37good}/${z37valid.length}`)
  console.log(`    Sheets >= 5m RMSE: ${z37bad}/${z37valid.length}`)
}

// ─── Previously-Affected Zone 36 Detail ───────────────────────────────────

console.log(`\n${SEP}`)
console.log(`  ZONE 36 SHEETS — DETAILED RESULTS (the sheets that were fixed)`)
console.log(SEP)

const z36Detailed = results
  .filter(r => r.isZone36 && r.hasValidCassini && r.helmertParams)
  .sort((a, b) => a.rmseMM - b.rmseMM)

console.log()
console.log(`  ${padEnd('Sheet', 12)} ${padEnd('Zone', 6)} ${padEnd('RMSE(m)', 12)} ${padEnd('Max(m)', 12)} ${padEnd('P', 12)} ${padEnd('Q', 14)} ${padEnd('Cx', 14)} ${padEnd('Cy', 14)} ${padEnd('A/B?', 6)} Corners`)
console.log(`  ${SEP_THIN}`)

for (const r of z36Detailed) {
  const hp = r.helmertParams!
  const hasAB = hp.A !== undefined && hp.B !== undefined
  const cornerDetail = r.perCornerErrors.map(e => `${e.corner}=${(e.total*1000).toFixed(0)}mm`).join(', ')

  console.log(
    `  ${padEnd(r.sheetId, 12)} ${padEnd('Z36', 6)} ${padEnd((r.rmseMM/1000).toFixed(3), 12)} ${padEnd((r.maxErrorMM/1000).toFixed(3), 12)} ${padEnd(hp.P.toFixed(8), 12)} ${padEnd(hp.Q.toExponential(2), 14)} ${padEnd(hp.Cx.toFixed(1), 14)} ${padEnd(hp.Cy.toFixed(1), 14)} ${padEnd(hasAB ? 'YES' : 'no', 6)} ${cornerDetail}`,
  )
}

// ─── Worst sheets (top 20 by RMSE) ────────────────────────────────────────

console.log(`\n${SEP}`)
console.log(`  TOP 20 WORST SHEETS (by RMSE)`)
console.log(SEP)

const worst20 = validResults
  .filter(r => r.helmertParams)
  .sort((a, b) => b.rmseMM - a.rmseMM)
  .slice(0, 20)

console.log()
console.log(`  ${padEnd('#', 3)} ${padEnd('Sheet', 12)} ${padEnd('Zone', 6)} ${padEnd('RMSE(m)', 12)} ${padEnd('Max(m)', 12)} ${padEnd('Was Bug?', 9)} Corner Detail`)
console.log(`  ${SEP_THIN}`)

worst20.forEach((r, i) => {
  const cornerDetail = r.perCornerErrors.map(e => `${e.corner}=${(e.total*1000).toFixed(0)}mm`).join(', ')
  console.log(
    `  ${padStart((i + 1).toString(), 3)} ${padEnd(r.sheetId, 12)} ${padEnd(r.isZone36 ? 'Z36' : 'Z37', 6)} ${padEnd((r.rmseMM/1000).toFixed(3), 12)} ${padEnd((r.maxErrorMM/1000).toFixed(3), 12)} ${padEnd(r.hadBug ? 'YES' : 'no', 9)} ${cornerDetail}`,
  )
})

// ─── Helmert Parameter Analysis ───────────────────────────────────────────

console.log(`\n${SEP}`)
console.log(`  HELMERT PARAMETER ANALYSIS`)
console.log(SEP)

// Check P (scale factor) distribution — should cluster around 0.3048 (ft→m)
const pValues = validResults.filter(r => r.helmertParams).map(r => r.helmertParams!.P)
const pAvg = pValues.reduce((a, b) => a + b, 0) / pValues.length
const pMin = Math.min(...pValues)
const pMax = Math.max(...pValues)
const pStdDev = Math.sqrt(pValues.reduce((s, p) => s + (p - pAvg) ** 2, 0) / pValues.length)

// Check Cy (northing translation) — should cluster around 10,000,000 for southern Kenya
const cyValues = validResults.filter(r => r.helmertParams).map(r => r.helmertParams!.Cy)
const cyAvg = cyValues.reduce((a, b) => a + b, 0) / cyValues.length
const cyMin = Math.min(...cyValues)
const cyMax = Math.max(...cyValues)

// Detect anomalous Cy values (not near 10M)
const cyAnomalous = cyValues.filter(cy => Math.abs(cy - 10000000) > 500000)
const cyGood = cyValues.filter(cy => Math.abs(cy - 10000000) <= 500000)

console.log()
console.log(`  P (scale factor) distribution:`)
console.log(`    Expected: ~0.3048 (ft→m conversion)`)
console.log(`    Average: ${pAvg.toFixed(10)}`)
console.log(`    Std Dev: ${pStdDev.toExponential(4)}`)
console.log(`    Range:   ${pMin.toFixed(10)} to ${pMax.toFixed(10)}`)
console.log(`    P = 0.3048 deviation: ${((pAvg - 0.3048) / 0.3048 * 100).toFixed(6)}%`)
console.log()

console.log(`  Cy (northing translation) distribution:`)
console.log(`    Expected: ~10,000,000m (UTM false northing for southern Kenya)`)
console.log(`    Average:  ${cyAvg.toFixed(1)} m`)
console.log(`    Range:    ${cyMin.toFixed(1)} to ${cyMax.toFixed(1)} m`)
console.log(`    Near 10M (within 500k): ${cyGood.length}/${cyValues.length} sheets`)
console.log(`    Anomalous (off by >500k): ${cyAnomalous.length}/${cyValues.length} sheets`)

if (cyAnomalous.length > 0) {
  console.log()
  console.log(`    ⚠️  Anomalous Cy values (potential remaining false northing issues):`)
  const anomalousResults = validResults
    .filter(r => r.helmertParams && Math.abs(r.helmertParams!.Cy - 10000000) > 500000)
    .sort((a, b) => a.helmertParams!.Cy - b.helmertParams!.Cy)

  for (const r of anomalousResults) {
    console.log(`      ${padEnd(r.sheetId, 12)} Cy = ${r.helmertParams!.Cy.toFixed(1)} m (${r.isZone36 ? 'Z36' : 'Z37'})`)
  }
}

// ─── Final Summary ─────────────────────────────────────────────────────────

console.log(`\n${SEP}`)
console.log(`  VALIDATION SUMMARY`)
console.log(SEP)
console.log()

if (avgRmse < 1000) {
  console.log(`  ✅ OVERALL AVERAGE RMSE: ${(avgRmse/1000).toFixed(3)}m — EXCELLENT`)
  console.log(`     All sheets average sub-metre accuracy with the false northing fix.`)
} else if (avgRmse < 3000) {
  console.log(`  ✅ OVERALL AVERAGE RMSE: ${(avgRmse/1000).toFixed(3)}m — GOOD`)
  console.log(`     Most sheets have good accuracy. Some outliers need investigation.`)
} else if (avgRmse < 5000) {
  console.log(`  ⚠️  OVERALL AVERAGE RMSE: ${(avgRmse/1000).toFixed(3)}m — MODERATE`)
  console.log(`     The false northing fix helped but significant residuals remain.`)
} else {
  console.log(`  ❌ OVERALL AVERAGE RMSE: ${(avgRmse/1000).toFixed(3)}m — NEEDS IMPROVEMENT`)
  console.log(`     The false northing fix may not have been fully applied.`)
}

console.log()
console.log(`  Key metrics:`)
console.log(`    - Sheets tested: ${totalValid}`)
console.log(`    - Median RMSE: ${(medianRmse/1000).toFixed(3)}m`)
console.log(`    - P95 RMSE: ${(p95Rmse/1000).toFixed(3)}m`)
console.log(`    - 95th percentile sheets: ${(grades['EXCELLENT (<1m)'] + grades['GOOD (1-3m)']) / totalValid * 100 .toFixed(1)}%`)
console.log(`    - Cy anomaly rate: ${cyAnomalous.length}/${cyValues.length} (${(cyAnomalous.length/cyValues.length*100).toFixed(1)}%)`)

console.log()
console.log(`${SEP}`)
console.log(`  VALIDATION COMPLETE`)
console.log(SEP)
console.log()
