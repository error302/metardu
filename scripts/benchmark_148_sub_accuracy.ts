/**
 * Benchmark: Test sub-sheet accuracy at interior points
 * Since 148/2.1 and 148/4.1 control points are outside the sub-sheet extent
 * (they're distant triangulation stations), we test at synthetic interior points.
 */
import {
  KENYA_SUB_SHEETS,
  findSubSheet,
  KENYA_TOPO_SHEETS,
  convertCassiniToUTM,
  cassiniFeetToUTMExactWithDatum,
  getSubSheetGrid,
} from '../src/lib/geo/cassini'

console.log('=== P2 Accuracy Benchmark: Interior Points ===\n')

// For each sheet, generate test points at sub-sheet centers
const targetSheets = ['148/2.1', '148/4.1']

for (const sheetId of targetSheets) {
  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
  if (!sheet) {
    console.log(`${sheetId}: NOT FOUND\n`)
    continue
  }

  const grid = getSubSheetGrid(sheetId)
  if (!grid || grid.length === 0) {
    console.log(`${sheetId}: NO GRID\n`)
    continue
  }

  console.log(`${sheetId}:`)
  console.log(`  Sheet Helmert params: P=${sheet.P}, Q=${sheet.Q}, Cx=${sheet.Cx}, Cy=${sheet.Cy}`)
  if (sheet.A !== undefined) console.log(`  A/B polynomial: A=${sheet.A}, B=${sheet.B}`)

  let totalWholeSheet = 0
  let totalSubHelmert = 0
  let totalSubAffine = 0
  let maxWholeSheet = 0
  let maxSubHelmert = 0
  let maxSubAffine = 0
  let count = 0
  let improvements = 0

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sub = grid[r][c]
      if (!sub) continue

      // Test at center of sub-sheet
      const cx = (sub.bounds.minX + sub.bounds.maxX) / 2
      const cy = (sub.bounds.minY + sub.bounds.maxY) / 2

      // Convert using whole-sheet Helmert
      const wholeResult = convertCassiniToUTM(
        [{ id: `test_${r}_${c}`, easting: cx, northing: cy }],
        sheet,
      )

      // Convert using sub-sheet Helmert
      const subHelmertResult = convertCassiniToUTM(
        [{ id: `test_${r}_${c}`, easting: cx, northing: cy }],
        sub.helmertParams,
      )

      // Convert using sub-sheet Affine
      const subAffineResult = convertCassiniToUTM(
        [{ id: `test_${r}_${c}`, easting: cx, northing: cy }],
        sub.affineParams,
      )

      // Ground truth: exact chain
      const exactResult = cassiniFeetToUTMExactWithDatum(
        [{ id: `test_${r}_${c}`, easting: cx, northing: cy }],
      )

      const wErr = Math.sqrt(
        (wholeResult[0].utmE - exactResult[0].utmE) ** 2 +
        (wholeResult[0].utmN - exactResult[0].utmN) ** 2
      )
      const hErr = Math.sqrt(
        (subHelmertResult[0].utmE - exactResult[0].utmE) ** 2 +
        (subHelmertResult[0].utmN - exactResult[0].utmN) ** 2
      )
      const aErr = Math.sqrt(
        (subAffineResult[0].utmE - exactResult[0].utmE) ** 2 +
        (subAffineResult[0].utmN - exactResult[0].utmN) ** 2
      )

      totalWholeSheet += wErr
      totalSubHelmert += hErr
      totalSubAffine += aErr
      maxWholeSheet = Math.max(maxWholeSheet, wErr)
      maxSubHelmert = Math.max(maxSubHelmert, hErr)
      maxSubAffine = Math.max(maxSubAffine, aErr)
      if (hErr < wErr) improvements++
      count++

      if (count <= 5 || hErr > 5) {
        console.log(`  Sub ${sub.subId} center (${cx.toFixed(0)}, ${cy.toFixed(0)}): ` +
          `Whole=${wErr.toFixed(2)}m, Sub-H4=${hErr.toFixed(2)}m, Sub-A6=${aErr.toFixed(2)}m` +
          (hErr < wErr ? ` ✓` : ''))
      }
    }
  }

  if (count > 0) {
    console.log(`  ---`)
    console.log(`  Whole-sheet Helmert+AB: avg=${(totalWholeSheet / count).toFixed(2)}m, max=${maxWholeSheet.toFixed(2)}m`)
    console.log(`  Sub-sheet Helmert4:      avg=${(totalSubHelmert / count).toFixed(2)}m, max=${maxSubHelmert.toFixed(2)}m`)
    console.log(`  Sub-sheet Affine6:       avg=${(totalSubAffine / count).toFixed(2)}m, max=${maxSubAffine.toFixed(2)}m`)
    console.log(`  Sub-sheet Helmert4 improved over whole-sheet: ${improvements}/${count} points`)
    if (totalSubHelmert > 0 && totalWholeSheet > 0) {
      const pctImprovement = ((1 - totalSubHelmert / totalWholeSheet) * 100)
      console.log(`  Overall improvement: ${pctImprovement.toFixed(1)}%`)
    }
  }

  console.log()
}

// Also benchmark existing 148 sheets (148/2, 148/4) for comparison
console.log('=== Comparison: Existing 148/2 and 148/4 sub-sheets ===\n')
const existingSheets = ['148/2', '148/4']

for (const sheetId of existingSheets) {
  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
  if (!sheet) continue

  const grid = getSubSheetGrid(sheetId)
  if (!grid || grid.length === 0) continue

  let totalWholeSheet = 0
  let totalSubHelmert = 0
  let count = 0

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sub = grid[r][c]
      if (!sub) continue

      const cx = (sub.bounds.minX + sub.bounds.maxX) / 2
      const cy = (sub.bounds.minY + sub.bounds.maxY) / 2

      const wholeResult = convertCassiniToUTM(
        [{ id: `test`, easting: cx, northing: cy }],
        sheet,
      )
      const subHelmertResult = convertCassiniToUTM(
        [{ id: `test`, easting: cx, northing: cy }],
        sub.helmertParams,
      )
      const exactResult = cassiniFeetToUTMExactWithDatum(
        [{ id: `test`, easting: cx, northing: cy }],
      )

      const wErr = Math.sqrt(
        (wholeResult[0].utmE - exactResult[0].utmE) ** 2 +
        (wholeResult[0].utmN - exactResult[0].utmN) ** 2
      )
      const hErr = Math.sqrt(
        (subHelmertResult[0].utmE - exactResult[0].utmE) ** 2 +
        (subHelmertResult[0].utmN - exactResult[0].utmN) ** 2
      )

      totalWholeSheet += wErr
      totalSubHelmert += hErr
      count++
    }
  }

  console.log(`${sheetId}:`)
  console.log(`  Whole-sheet Helmert+AB: avg=${(totalWholeSheet / count).toFixed(2)}m`)
  console.log(`  Sub-sheet Helmert4:      avg=${(totalSubHelmert / count).toFixed(2)}m`)
  if (totalWholeSheet > 0) {
    console.log(`  Improvement: ${((1 - totalSubHelmert / totalWholeSheet) * 100).toFixed(1)}%`)
  }
  console.log()
}

console.log('Done.')
