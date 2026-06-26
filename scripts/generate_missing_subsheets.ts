/**
 * Generate missing sub-sheets for 134/4, 135/1-135/4
 * Uses bilinear interpolation of the 4 sheet corners (same method as extract_all.py)
 * to maintain consistency with existing sub-sheet data.
 */
import * as fs from 'fs'
import * as path from 'path'

// Read the 4 sheet corners from national XLS data
// (already embedded in kenya_sheets.ts as common points)
import { KENYA_TOPO_SHEETS } from '../src/lib/geo/cassini'

interface Corner {
  cassX: number
  cassY: number
  utmE: number
  utmN: number
}

function bilinearInterpolateGrid(corners: Corner[], gridSize = 6): Corner[][] {
  // Use corners in their given order [C1, C2, C3, C4] for bilinear interpolation.
  // This matches the fallback in extract_all.py.
  // C1=TL, C2=TR, C3=BR, C4=BL (or whatever order the data provides)
  const [p00, p10, p01, p11] = corners  // TL, TR, BR, BL

  const grid: Corner[][] = []
  for (let r = 0; r < gridSize; r++) {
    const row: Corner[] = []
    for (let c = 0; c < gridSize; c++) {
      const s = c / (gridSize - 1)  // 0=left, 1=right
      const t = r / (gridSize - 1)  // 0=top, 1=bottom

      const interp = (a: number, b: number, c_: number, d: number) =>
        (1-s)*(1-t)*a + s*(1-t)*b + (1-s)*t*c_ + s*t*d

      row.push({
        cassX: interp(p00.cassX, p10.cassX, p01.cassX, p11.cassX),
        cassY: interp(p00.cassY, p10.cassY, p01.cassY, p11.cassY),
        utmE: interp(p00.utmE, p10.utmE, p01.utmE, p11.utmE),
        utmN: interp(p00.utmN, p10.utmN, p01.utmN, p11.utmN),
      })
    }
    grid.push(row)
  }
  return grid
}

function gridToSubSheets(grid: Corner[][]): Record<string, Corner[]> {
  const result: Record<string, Corner[]> = {}
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const subId = String(r * 5 + c + 1)
      // Corners: TL, TR, BR, BL (same order as extract_all.py)
      const corners: Corner[] = [
        grid[r][c],       // TL
        grid[r][c+1],     // TR
        grid[r+1][c+1],   // BR
        grid[r+1][c],     // BL
      ]
      result[subId] = corners
    }
  }
  return result
}

// Main
const missingSheets = ['134/4', '135/1', '135/2', '135/3', '135/4']
const output: Record<string, Record<string, Corner[]>> = {}

console.log('Generating missing sub-sheets via bilinear interpolation:\n')

for (const sheetId of missingSheets) {
  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
  if (!sheet || sheet.commonPoints.length < 4) {
    console.error(`  ${sheetId}: NOT FOUND or < 4 corners`)
    continue
  }

  // Build corners from common points
  const corners: Corner[] = sheet.commonPoints.map(cp => ({
    cassX: cp.cassE,
    cassY: cp.cassN,
    utmE: cp.utmE,
    utmN: cp.utmN,
  }))

  console.log(`${sheetId}:`)
  console.log(`  Corners: C1(${corners[0].cassX.toFixed(1)}, ${corners[0].cassY.toFixed(1)}) → C4(${corners[3].cassX.toFixed(1)}, ${corners[3].cassY.toFixed(1)})`)
  console.log(`  UTM: C1(${corners[0].utmE.toFixed(1)}, ${corners[0].utmN.toFixed(1)}) → C4(${corners[3].utmE.toFixed(1)}, ${corners[3].utmN.toFixed(1)})`)

  const grid = bilinearInterpolateGrid(corners)
  const subs = gridToSubSheets(grid)
  output[sheetId] = subs

  console.log(`  Generated ${Object.keys(subs).length} sub-sheets`)
  console.log(`  Sub 13 center: cass(${subs['13'][0].cassX.toFixed(1)}, ${subs['13'][0].cassY.toFixed(1)})`)

  // Edge consistency check
  const ss1 = subs['1']
  const ss2 = subs['2']
  const diffX = Math.abs(ss1[1].cassX - ss2[3].cassX)
  const diffY = Math.abs(ss1[1].cassY - ss2[3].cassY)
  console.log(`  Edge check (Sub 1 NE vs Sub 2 NW): dX=${diffX.toFixed(6)}, dY=${diffY.toFixed(6)}`)
  console.log()
}

// Merge into merged_subsheets.json
const mergedPath = path.join(__dirname, '../data/cassini/merged_subsheets.json')
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf-8'))

let addedCount = 0
let conflictCount = 0
for (const [sheetId, subs] of Object.entries(output)) {
  if (sheetId in merged) {
    console.warn(`WARNING: ${sheetId} already exists in merged_subsheets.json — SKIPPING`)
    conflictCount++
  } else {
    merged[sheetId] = subs
    addedCount++
  }
}

fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2))

console.log(`\nResults:`)
console.log(`  Added: ${addedCount} sheets`)
console.log(`  Skipped (conflicts): ${conflictCount}`)
console.log(`  Total in merged_subsheets.json: ${Object.keys(merged).length} sheets`)
console.log(`  Total sub-sheets: ${Object.values(merged).reduce((s, v) => s + Object.keys(v).length, 0)}`)
