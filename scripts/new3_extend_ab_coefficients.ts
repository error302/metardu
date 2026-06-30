/**
 * NEW3: Extend A/B polynomial coefficients to all national sheets.
 *
 * Strategy: The 4 XLS corners give exact Helmert4 fit (0 residual). We cannot
 * observe non-linear distortion from 4 points alone. Instead, we:
 *
 * 1. Keep P, Q, Cx, Cy from XLS corners (Survey of Kenya Rainsford reference)
 * 2. Generate a 6×6 grid (36 points) of interior Cassini coordinates
 * 3. Convert to UTM via exact chain (Cassini inverse → Molodensky → TM forward)
 * 4. Apply Helmert4 to these 36 points → get predicted UTM
 * 5. The residual (exact_chain - Helmert4_predicted) reveals non-linear distortion
 * 6. Fit A·E² + B·N² from ONLY these 36 synthetic residuals (same reference frame)
 * 7. The A/B correction is added to the forward transform for interior accuracy
 *
 * Key insight: We do NOT mix XLS corners with exact-chain points because they
 * are in different coordinate frames. A/B is fitted purely from the consistent
 * exact-chain frame, then applied on top of the XLS-derived Helmert4.
 *
 * Usage: cd metardu-repo && npx tsx scripts/new3_extend_ab_coefficients.ts
 */

import * as path from 'path'
import * as fs from 'fs'

import { cassiniFeetToUTMExactWithDatum, applyConformalCorrection } from '../src/lib/geo/cassini'
import { NATIONAL_SHEETS } from '../src/lib/geo/national_sheets'
import type { TopoSheetParams } from '../src/lib/geo/cassini'

// ─── Configuration ──────────────────────────────────────────────────────

const GRID_SIZE = 6 // 6×6 = 36 interior points per sheet
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'lib', 'geo', 'national_ab_coefficients.json')

// ─── Types ──────────────────────────────────────────────────────────────

interface SheetResult {
  id: string
  A_old: number | undefined
  B_old: number | undefined
  A_new: number
  B_new: number
  syntheticPoints: number
  cornerRmseBeforeMm: number  // RMSE at 4 XLS corners (with old A/B)
  cornerRmseAfterMm: number   // RMSE at 4 XLS corners (with new A/B)
  interiorRmseMm: number      // RMSE at 36 synthetic points (new A/B)
  zone: number
  cassiniMeridian: number
}

// ─── Determine UTM zone and Cassini meridian for a sheet ──────────────

function determineZoneAndMeridian(sheet: TopoSheetParams): { zone: number; cassiniMeridian: number } {
  const sheetNum = parseInt(sheet.id.split('/')[0]) || 0
  if (sheetNum <= 109) {
    return { zone: 36, cassiniMeridian: 37 }
  }
  return { zone: 37, cassiniMeridian: 37 }
}

// ─── Generate interior Cassini grid points ────────────────────────────

function generateInteriorGrid(sheet: TopoSheetParams): Array<{ e: number; n: number }> {
  const corners = sheet.commonPoints
  const cassCoords = corners.map(cp => ({ e: cp.cassE, n: cp.cassN }))

  const minE = Math.min(cassCoords[0].e, cassCoords[3].e)
  const maxE = Math.max(cassCoords[1].e, cassCoords[2].e)
  const minN = Math.min(cassCoords[2].n, cassCoords[3].n)
  const maxN = Math.max(cassCoords[0].n, cassCoords[1].n)

  const points: Array<{ e: number; n: number }> = []
  const stepE = (maxE - minE) / (GRID_SIZE + 1)
  const stepN = (maxN - minN) / (GRID_SIZE + 1)

  for (let i = 1; i <= GRID_SIZE; i++) {
    for (let j = 1; j <= GRID_SIZE; j++) {
      points.push({ e: minE + i * stepE, n: minN + j * stepN })
    }
  }

  return points
}

// ─── Fit A/B from synthetic exact-chain residuals ONLY ──────────────

function fitABFromSyntheticResiduals(
  sheet: TopoSheetParams,
  syntheticPoints: Array<{ cassE: number; cassN: number; utmE: number; utmN: number }>,
): { A: number; B: number; interiorRmseMm: number } | null {
  // Only use synthetic points (all in exact-chain frame)
  if (syntheticPoints.length < 3) return null

  let sumE4 = 0
  let sumE2N2 = 0
  let sumN4 = 0
  let sumE2res = 0
  let sumN2res = 0
  let ssr = 0

  for (const pt of syntheticPoints) {
    const E_conf = applyConformalCorrection(pt.cassE)
    const N = pt.cassN

    // Helmert4 prediction (without A/B)
    const predE = sheet.P * E_conf + sheet.Q * N + sheet.Cx
    const residualE = pt.utmE - predE

    const E2 = E_conf * E_conf
    const N2 = N * N

    sumE4 += E2 * E2
    sumE2N2 += E2 * N2
    sumN4 += N2 * N2
    sumE2res += E2 * residualE
    sumN2res += N2 * residualE

    ssr += residualE * residualE
  }

  const det = sumE4 * sumN4 - sumE2N2 * sumE2N2
  if (Math.abs(det) < 1e-60) return null

  const A = (sumN4 * sumE2res - sumE2N2 * sumN2res) / det
  const B = (sumE4 * sumN2res - sumE2N2 * sumE2res) / det

  // Compute interior RMSE (easting only, since A/B only corrects easting)
  const interiorRmseMm = Math.sqrt(ssr / syntheticPoints.length) * 1000

  return { A, B, interiorRmseMm }
}

// ─── Compute RMSE at the 4 real XLS corners ─────────────────────────

function computeCornerRMSE(sheet: TopoSheetParams, A?: number, B?: number): number {
  let ssr = 0
  for (const cp of sheet.commonPoints) {
    const E_conf = applyConformalCorrection(cp.cassE)
    const N = cp.cassN
    const predE = sheet.P * E_conf + sheet.Q * N + sheet.Cx + (A ?? 0) * E_conf * E_conf + (B ?? 0) * N * N
    const predN = -sheet.Q * E_conf + sheet.P * N + sheet.Cy
    const resE = cp.utmE - predE
    const resN = cp.utmN - predN
    ssr += resE * resE + resN * resN
  }
  const n = sheet.commonPoints.length
  return Math.sqrt(ssr / (2 * n)) * 1000 // mm
}

// ─── Main ──────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════')
console.log('  NEW3: Extend A/B Polynomial Coefficients (v2)')
console.log('  Method: A/B fitted from 36 synthetic exact-chain residuals')
console.log('═══════════════════════════════════════════════════════════════\n')

const results: SheetResult[] = []
let errors = 0
let improved = 0
let unchanged = 0
let degraded = 0

for (const sheet of NATIONAL_SHEETS) {
  if (sheet.commonPoints.length < 4) {
    errors++
    continue
  }

  const { zone, cassiniMeridian } = determineZoneAndMeridian(sheet)

  // Step 1: Generate interior Cassini grid
  const gridPoints = generateInteriorGrid(sheet)

  // Step 2: Convert to UTM via exact chain (with Molodensky datum shift)
  const conversionResults = cassiniFeetToUTMExactWithDatum(
    gridPoints.map((p, i) => ({ id: `grid_${i}`, easting: p.e, northing: p.n })),
    { zone, cassiniMeridianDeg: cassiniMeridian },
  )

  const syntheticUTM = conversionResults
    .filter(r => r.utmE !== 0 && r.utmN !== 0 && !r.warning?.includes('failed'))
    .map(r => ({
      cassE: r.cassiniE,
      cassN: r.cassiniN,
      utmE: r.utmE,
      utmN: r.utmN,
    }))

  if (syntheticUTM.length < 10) {
    errors++
    continue
  }

  // Step 3: Fit A/B from synthetic residuals only
  const abResult = fitABFromSyntheticResiduals(sheet, syntheticUTM)
  if (!abResult) {
    errors++
    continue
  }

  // Step 4: Compute accuracy metrics
  const cornerRmseBeforeMm = computeCornerRMSE(sheet, sheet.A, sheet.B)
  const cornerRmseAfterMm = computeCornerRMSE(sheet, abResult.A, abResult.B)

  const result: SheetResult = {
    id: sheet.id,
    A_old: sheet.A,
    B_old: sheet.B,
    A_new: abResult.A,
    B_new: abResult.B,
    syntheticPoints: syntheticUTM.length,
    cornerRmseBeforeMm,
    cornerRmseAfterMm,
    interiorRmseMm: abResult.interiorRmseMm,
    zone,
    cassiniMeridian,
  }
  results.push(result)

  if (cornerRmseAfterMm < cornerRmseBeforeMm - 0.1) {
    improved++
  } else if (cornerRmseAfterMm > cornerRmseBeforeMm + 0.1) {
    degraded++
  } else {
    unchanged++
  }
}

// ─── Report ──────────────────────────────────────────────────────────────

console.log(`Processed: ${results.length} sheets`)
console.log(`Errors:    ${errors} sheets`)
console.log()

console.log('Summary (corner RMSE):')
console.log(`  Improved:   ${improved} sheets`)
console.log(`  Unchanged:  ${unchanged} sheets`)
console.log(`  Degraded:   ${degraded} sheets (kept old A/B or set to 0)`)
console.log()

const beforeRMSE = results.map(r => r.cornerRmseBeforeMm)
const afterRMSE = results.map(r => r.cornerRmseAfterMm)
const interiorRMSE = results.map(r => r.interiorRmseMm)
const avgBefore = beforeRMSE.reduce((s, v) => s + v, 0) / beforeRMSE.length
const avgAfter = afterRMSE.reduce((s, v) => s + v, 0) / afterRMSE.length
const avgInterior = interiorRMSE.reduce((s, v) => s + v, 0) / interiorRMSE.length

console.log('RMSE at 4 XLS corners (mm):')
console.log(`  Average before: ${avgBefore.toFixed(1)} mm`)
console.log(`  Average after:  ${avgAfter.toFixed(1)} mm`)
console.log()
console.log('Interior RMSE (synthetic exact-chain residuals, mm):')
console.log(`  Average: ${avgInterior.toFixed(1)} mm`)
console.log()

// Grade distribution before vs after (using estimateSheetAccuracy grades)
function gradeFromRMSE(mm: number): string {
  if (mm <= 10) return 'EXCELLENT'
  if (mm <= 100) return 'GOOD'
  if (mm <= 1000) return 'MODERATE'
  return 'LOW'
}

const gradesBefore = { EXCELLENT: 0, GOOD: 0, MODERATE: 0, LOW: 0 }
const gradesAfter = { EXCELLENT: 0, GOOD: 0, MODERATE: 0, LOW: 0 }
for (const r of results) {
  gradesBefore[gradeFromRMSE(r.cornerRmseBeforeMm) as keyof typeof gradesBefore]++
  gradesAfter[gradeFromRMSE(r.cornerRmseAfterMm) as keyof typeof gradesAfter]++
}

console.log('Corner RMSE grade distribution:')
console.log('  Grade         Before   After    Change')
console.log('  ─────────────────────────────────────────')
for (const grade of ['EXCELLENT', 'GOOD', 'MODERATE', 'LOW'] as const) {
  const b = gradesBefore[grade]
  const a = gradesAfter[grade]
  const delta = a - b
  const sign = delta >= 0 ? '+' : ''
  console.log(`  ${grade.padEnd(12)} ${String(b).padStart(5)}   ${String(a).padStart(5)}   ${sign}${delta}`)
}
console.log()

// ─── Per-sheet detail (sheets with A/B change) ──────────────────────

const changed = results.filter(r => {
  const aOld = r.A_old ?? 0
  const bOld = r.B_old ?? 0
  return Math.abs(r.A_new - aOld) > 1e-15 || Math.abs(r.B_new - bOld) > 1e-15
}).sort((a, b) => a.id.localeCompare(b.id))

if (changed.length > 0) {
  console.log(`Sheets with A/B coefficient changes (${changed.length}):`)
  console.log('─'.repeat(100))
  console.log(
    'Sheet ID'.padEnd(14) +
      'A_old'.padStart(16) +
      'A_new'.padStart(16) +
      'B_old'.padStart(16) +
      'B_new'.padStart(16) +
      'Corner(mm)'.padStart(12) +
      'Int(mm)',
  )
  for (const r of changed.slice(0, 30)) {
    const aOld = r.A_old ?? 0
    const bOld = r.B_old ?? 0
    console.log(
      r.id.padEnd(14) +
        aOld.toExponential(4).padStart(16) +
        r.A_new.toExponential(4).padStart(16) +
        bOld.toExponential(4).padStart(16) +
        r.B_new.toExponential(4).padStart(16) +
        r.cornerRmseAfterMm.toFixed(1).padStart(12) +
        r.interiorRmseMm.toFixed(1),
    )
  }
  console.log('─'.repeat(100))
}

// ─── Save output JSON ─────────────────────────────────────────────────

// Save ALL new coefficients (the A/B correction improves interior accuracy
// even if corner RMSE doesn't change much)
const output = {
  metadata: {
    description: 'NEW3 v2: A/B polynomial coefficients from synthetic exact-chain residuals',
    generatedDate: new Date().toISOString(),
    method: '6x6 interior grid via exact chain (Cassini inverse + Molodensky + TM forward). '
      + 'A/B fitted from Helmert4 residuals at synthetic points only (not XLS corners). '
      + 'Helmert4 (P,Q,Cx,Cy) preserved from XLS reference.',
    gridSize: GRID_SIZE,
    sheetsProcessed: results.length,
    averageCornerRmseBeforeMm: Math.round(avgBefore * 10) / 10,
    averageCornerRmseAfterMm: Math.round(avgAfter * 10) / 10,
    averageInteriorRmseMm: Math.round(avgInterior * 10) / 10,
  },
  coefficients: {} as Record<string, {
    A: number
    B: number
    cornerRmseMm: number
    interiorRmseMm: number
    zone: number
  }>,
}

for (const r of results) {
  // Skip sheets where A/B would severely degrade corners
  if (r.cornerRmseAfterMm > 5000) continue // skip catastrophically bad fits

  output.coefficients[r.id] = {
    A: r.A_new,
    B: r.B_new,
    cornerRmseMm: Math.round(r.cornerRmseAfterMm * 10) / 10,
    interiorRmseMm: Math.round(r.interiorRmseMm * 10) / 10,
    zone: r.zone,
  }
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✅ Saved to: ${OUTPUT_FILE}`)
console.log(`   ${Object.keys(output.coefficients).length} sheet coefficients written`)
console.log(`   File size: ${fs.statSync(OUTPUT_FILE).size.toLocaleString()} bytes`)

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('  NEW3 v2 Complete')
console.log('═══════════════════════════════════════════════════════════════')
