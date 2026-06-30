/**
 * Benchmark: Verify synthetic 5×5 sub-sheets for 148/2.1 and 148/4.1
 */
import {
  KENYA_SUB_SHEETS,
  SHEETS_WITH_SUBSHEETS,
  findSubSheet,
  getSubSheetGrid,
  KENYA_TOPO_SHEETS,
  convertCassiniToUTM,
  cassiniFeetToUTMExactWithDatum,
} from '../src/lib/geo/cassini'

console.log('=== P2 Verification: Synthetic 5×5 Sub-sheets for Series 148 ===\n')

// 1. Verify sub-sheet count
const sub148 = KENYA_SUB_SHEETS.filter(ss => ss.sheetId.startsWith('148'))
console.log('148 series sub-sheets in KENYA_SUB_SHEETS:')
const sheetIds = new Set(sub148.map(ss => ss.sheetId))
for (const sid of [...sheetIds].sort()) {
  const count = sub148.filter(ss => ss.sheetId === sid).length
  const hasSubsheets = SHEETS_WITH_SUBSHEETS.has(sid)
  console.log(`  ${sid}: ${count} sub-sheets (in SHEETS_WITH_SUBSHEETS: ${hasSubsheets})`)
}

console.log(`\nTotal 148 sub-sheets: ${sub148.length}`)
console.log(`Total all sub-sheets: ${KENYA_SUB_SHEETS.length}`)
console.log(`Sheets with sub-sheets: ${SHEETS_WITH_SUBSHEETS.size}`)

// 2. Verify 148/2.1 grid structure
console.log('\n148/2.1 sub-sheet grid:')
const grid = getSubSheetGrid('148/2.1')
for (let r = 0; r < 5; r++) {
  const row = grid[r].map(ss => ss ? ss.subId.padStart(2) : '--').join(' ')
  console.log(`  Row ${r}: [${row}]`)
}

// 3. Verify findSubSheet works for 148/2.1
console.log('\nfindSubSheet test for 148/2.1:')
const testPt = { easting: -45000, northing: -420000 }
const found = findSubSheet('148/2.1', testPt.easting, testPt.northing)
if (found) {
  console.log(`  Found sub-sheet ${found.fullId} for point (${testPt.easting}, ${testPt.northing})`)
} else {
  console.log(`  NOT FOUND for point (${testPt.easting}, ${testPt.northing})`)
}

// 4. Accuracy benchmark: sub-sheet Helmert vs exact chain at control points
console.log('\n=== Accuracy: Sub-sheet Helmert4 vs Exact Chain (ground truth) ===')
const targetSheets = ['148/2.1', '148/4.1']
for (const sheetId of targetSheets) {
  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
  if (!sheet) {
    console.log(`\n${sheetId}: NOT FOUND in KENYA_TOPO_SHEETS`)
    continue
  }

  console.log(`\n${sheetId} (common points: ${sheet.commonPoints.map(cp => cp.station).join(', ')}):`)
  const subsForSheet = KENYA_SUB_SHEETS.filter(ss => ss.sheetId === sheetId)

  if (subsForSheet.length === 0) {
    console.log('  No sub-sheets available.')
    continue
  }

  // Test each common point
  let totalHelmert = 0
  let totalAffine = 0
  let maxHelmert = 0
  let maxAffine = 0
  let count = 0

  for (const cp of sheet.commonPoints) {
    const sub = findSubSheet(sheetId, cp.cassE, cp.cassN)
    if (!sub) {
      console.log(`  ${cp.station}: NO SUB-SHEET FOUND`)
      continue
    }

    // Convert using sub-sheet Helmert params
    const helmertResult = convertCassiniToUTM(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
      sub.helmertParams,
    )

    // Convert using sub-sheet Affine params
    const affineResult = convertCassiniToUTM(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
      sub.affineParams,
    )

    // Ground truth: exact chain
    const exactResult = cassiniFeetToUTMExactWithDatum(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
    )

    const hErrE = helmertResult[0].utmE - exactResult[0].utmE
    const hErrN = helmertResult[0].utmN - exactResult[0].utmN
    const hErr = Math.sqrt(hErrE * hErrE + hErrN * hErrN)

    const aErrE = affineResult[0].utmE - exactResult[0].utmE
    const aErrN = affineResult[0].utmN - exactResult[0].utmN
    const aErr = Math.sqrt(aErrE * aErrE + aErrN * aErrN)

    totalHelmert += hErr
    totalAffine += aErr
    maxHelmert = Math.max(maxHelmert, hErr)
    maxAffine = Math.max(maxAffine, aErr)
    count++

    console.log(`  ${cp.station} (sub ${sub.subId}): Helmert4=${hErr.toFixed(2)}m, Affine6=${aErr.toFixed(2)}m`)
  }

  if (count > 0) {
    console.log(`  ---`)
    console.log(`  Helmert4: avg=${(totalHelmert / count).toFixed(2)}m, max=${maxHelmert.toFixed(2)}m`)
    console.log(`  Affine6:  avg=${(totalAffine / count).toFixed(2)}m, max=${maxAffine.toFixed(2)}m`)
  }
}

// 5. Compare with parent sheet (whole-sheet Helmert) for same points
console.log('\n=== Comparison: Whole-sheet Helmert vs Sub-sheet Methods ===')
for (const sheetId of targetSheets) {
  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
  if (!sheet) continue

  console.log(`\n${sheetId}:`)
  for (const cp of sheet.commonPoints) {
    // Whole-sheet Helmert+AB
    const wholeResult = convertCassiniToUTM(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
      sheet,
    )

    // Exact ground truth
    const exactResult = cassiniFeetToUTMExactWithDatum(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
    )

    // Sub-sheet Helmert
    const sub = findSubSheet(sheetId, cp.cassE, cp.cassN)
    let subHelmertResult
    if (sub) {
      subHelmertResult = convertCassiniToUTM(
        [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
        sub.helmertParams,
      )
    }

    const wErr = Math.sqrt(
      (wholeResult[0].utmE - exactResult[0].utmE) ** 2 +
      (wholeResult[0].utmN - exactResult[0].utmN) ** 2
    )
    const sErr = sub ? Math.sqrt(
      (subHelmertResult![0].utmE - exactResult[0].utmE) ** 2 +
      (subHelmertResult![0].utmN - exactResult[0].utmN) ** 2
    ) : NaN

    console.log(`  ${cp.station}: Whole-sheet=${wErr.toFixed(2)}m, Sub-sheet=${sub ? sErr.toFixed(2) + 'm' : 'N/A'}, ` +
      (sub && sErr < wErr ? `IMPROVEMENT: ${(wErr - sErr).toFixed(2)}m` : ''))
  }
}

console.log('\nDone.')
