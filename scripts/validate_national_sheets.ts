/**
 * Validation script for National XLS-derived topographic sheet parameters.
 *
 * Usage: cd metardu-repo && npx tsx scripts/validate_national_sheets.ts
 *
 * Prints per-sheet accuracy info and summary statistics.
 */

import {
  NATIONAL_SHEETS,
  getNationalSheet,
  getNationalSheetStats,
} from '../src/lib/geo/national_sheets'
import { estimateSheetAccuracy } from '../src/lib/geo/cassini'
import type { TopoSheetParams } from '../src/lib/geo/cassini'

console.log('═══════════════════════════════════════════════════════════════')
console.log('  National Sheet Validation Report')
console.log('═══════════════════════════════════════════════════════════════\n')

// ─── 1. Processing Statistics ────────────────────────────────────────────

const stats = getNationalSheetStats()
console.log('Processing Statistics:')
console.log(`  Total sheets in XLS:         ${stats.totalInXLS}`)
console.log(`  Empty placeholders skipped:   ${stats.emptyPlaceholders}`)
console.log(`  UTM-only (no Cassini):        ${stats.utmOnlySkipped}`)
console.log(`  Degenerate corners skipped:  ${stats.degenerateSkipped}`)
console.log(`  Computation errors:          ${stats.computeErrors}`)
console.log(`  Successfully processed:      ${stats.successfullyProcessed}`)
console.log()

// ─── 2. Per-Sheet Accuracy Report ──────────────────────────────────────

interface SheetReport {
  id: string
  grade: string
  rmseM: number
  rmseMM: number
  numPoints: number
  P: number
  Q: number
  params: TopoSheetParams
}

const reports: SheetReport[] = []
let poorSheets: SheetReport[] = []

for (const sheet of NATIONAL_SHEETS) {
  const acc = estimateSheetAccuracy(sheet)
  const report: SheetReport = {
    id: sheet.id,
    grade: acc.grade,
    rmseM: acc.rmseM,
    rmseMM: acc.rmseMM,
    numPoints: sheet.commonPoints.length,
    P: sheet.P,
    Q: sheet.Q,
    params: sheet,
  }
  reports.push(report)
  if (acc.rmseM > 10) {
    poorSheets.push(report)
  }
}

console.log(`Per-Sheet Report (${reports.length} sheets):`)
console.log('─'.repeat(90))
console.log(
  'Sheet ID'.padEnd(14) +
    'Grade'.padStart(11) +
    'RMSE(m)'.padStart(12) +
    'RMSE(mm)'.padStart(12) +
    'Pts'.padStart(6) +
    'Scale (P)'.padStart(14) +
    'Rotation (Q)',
)
console.log('─'.repeat(90))

for (const r of reports) {
  const gradeStr = r.grade === 'EXCELLENT' ? '★★★★★' :
    r.grade === 'GOOD' ? '★★★★☆' :
    r.grade === 'MODERATE' ? '★★★☆☆' :
    r.grade === 'LOW' ? '★★☆☆☆' : '★☆☆☆☆'
  const gradeColor = r.grade === 'EXCELLENT' ? 'OK' : r.grade === 'GOOD' ? 'OK' : r.grade === 'MODERATE' ? 'WARN' : 'FAIL'
  console.log(
    r.id.padEnd(14) +
    r.grade.padStart(11) +
    r.rmseM.toFixed(6).padStart(12) +
    r.rmseMM.toFixed(1).padStart(12) +
    String(r.numPoints).padStart(6) +
    r.P.toFixed(10).padStart(14) +
    r.Q.toExponential(3),
  )
}
console.log('─'.repeat(90))
console.log()

// ─── 3. Summary Statistics ────────────────────────────────────────────

const rmseValues = reports.filter(r => isFinite(r.rmseM)).map(r => r.rmseM)
const avgRmse = rmseValues.length > 0
  ? rmseValues.reduce((s, v) => s + v, 0) / rmseValues.length
  : NaN
const maxRmse = rmseValues.length > 0 ? Math.max(...rmseValues) : NaN
const minRmse = rmseValues.length > 0 ? Math.min(...rmseValues) : NaN

const gradeCounts: Record<string, number> = {}
for (const r of reports) {
  gradeCounts[r.grade] = (gradeCounts[r.grade] || 0) + 1
}

console.log('Summary Statistics:')
console.log(`  Total processed:       ${reports.length}`)
console.log(`  Average RMSE:          ${avgRmse.toFixed(4)} m (${(avgRmse * 1000).toFixed(1)} mm)`)
console.log(`  Min RMSE:              ${minRmse.toFixed(6)} m`)
console.log(`  Max RMSE:              ${maxRmse.toFixed(4)} m`)
console.log()
console.log('  Grade Distribution:')
for (const grade of ['EXCELLENT', 'GOOD', 'MODERATE', 'LOW', 'UNKNOWN']) {
  const count = gradeCounts[grade] || 0
  const pct = reports.length > 0 ? ((count / reports.length) * 100).toFixed(1) : '0.0'
  const bar = '█'.repeat(Math.round(count / reports.length * 30))
  console.log(`    ${grade.padEnd(10)} ${String(count).padStart(4)} (${pct}%) ${bar}`)
}
console.log()

// ─── 4. Poor Accuracy Sheets ────────────────────────────────────────────

if (poorSheets.length > 0) {
  console.log(`⚠️  Sheets with POOR accuracy (RMSE > 10m): ${poorSheets.length}`)
  console.log('─'.repeat(70))
  for (const r of poorSheets) {
    console.log(`  ${r.id.padEnd(14)} RMSE = ${r.rmseM.toFixed(2)} m  (${r.rmseMM.toFixed(0)} mm)`)
  }
  console.log('─'.repeat(70))
  console.log()
} else {
  console.log('✅ No sheets with POOR accuracy (RMSE > 10m).')
  console.log()
}

// ─── 5. Spot-check: Lookup a specific sheet ──────────────────────────────

const testSheetId = '102/1'
const testSheet = getNationalSheet(testSheetId)
if (testSheet) {
  const acc = estimateSheetAccuracy(testSheet)
  console.log(`Spot-check — Sheet ${testSheetId}:`)
  console.log(`  P = ${testSheet.P}`)
  console.log(`  Q = ${testSheet.Q}`)
  console.log(`  Cx = ${testSheet.Cx}`)
  console.log(`  Cy = ${testSheet.Cy}`)
  console.log(`  RMSE = ${acc.rmseM.toFixed(6)} m (${acc.rmseMM.toFixed(1)} mm)`)
  console.log(`  Grade = ${acc.grade}`)
  console.log(`  Points = ${testSheet.commonPoints.length}`)
} else {
  console.log(`Spot-check — Sheet ${testSheetId}: NOT FOUND`)
}

console.log()
console.log('═══════════════════════════════════════════════════════════════')
console.log('  Validation Complete')
console.log('═══════════════════════════════════════════════════════════════')
