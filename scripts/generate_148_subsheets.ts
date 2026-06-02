/**
 * P2: Generate synthetic 5×5 sub-sheets for Series 148
 *
 * This script generates sub-sheet corner data for sheets 148/2.1 and 148/4.1,
 * which are missing from merged_subsheets.json. These sheets cover the same
 * geographic area as 148/2 and 148/4 respectively, but use different Helmert
 * transformation parameters derived from different control points.
 *
 * Strategy:
 * 1. Extract the Cassini 6×6 grid lattice from existing 148/2 and 148/4 sub-sheets
 * 2. For each lattice point, compute UTM using the exact chain (Cassini inverse →
 *    Molodensky datum shift → TM forward) — the most accurate independent method
 * 3. Compose 25 sub-sheets per sheet (5×5 grid) from the lattice corners
 * 4. Write output to merge into merged_subsheets.json
 *
 * The buildSubSheets() function in cassini.ts will then auto-compute Helmert 4-param
 * and Affine 6-param for each sub-sheet from its 4 corners.
 */

import {
  cassiniFeetToUTMExactWithDatum,
} from '../src/lib/geo/cassini'
import SUBSHEET_CORNERS_RAW from '../src/lib/geo/merged_subsheets.json'

interface CornerPoint {
  cassX: number
  cassY: number
  utmE: number
  utmN: number
}

type SheetData = Record<string, Record<string, CornerPoint[]>>

/**
 * Extract the unique 6×6 Cassini grid lattice from a sheet's 25 sub-sheets.
 *
 * Sub-sheets are numbered 1-25 in reading order (left-to-right, top-to-bottom).
 * Each sub-sheet has 4 corners in order [SW, SE, NE, NW].
 *
 * The lattice has 6 rows (0=north to 5=south) × 6 cols (0=west to 5=east).
 * Sub-sheet at (row, col) has corners:
 *   SW = lattice[row+1][col], SE = lattice[row+1][col+1],
 *   NE = lattice[row][col+1], NW = lattice[row][col]
 */
function extractCassiniLattice(sheetId: string): { x: number[][], y: number[][] } {
  const raw = SUBSHEET_CORNERS_RAW as unknown as SheetData
  const subs = raw[sheetId]
  if (!subs) throw new Error(`Sheet ${sheetId} not found in merged_subsheets.json`)

  // Initialize 6×6 lattice with null
  const lattice: { x: (number | null)[][], y: (number | null)[][] } = {
    x: Array.from({ length: 6 }, () => Array(6).fill(null)),
    y: Array.from({ length: 6 }, () => Array(6).fill(null)),
  }

  for (let subIdx = 1; subIdx <= 25; subIdx++) {
    const corners = subs[String(subIdx)]
    if (!corners || corners.length < 4) continue

    const row = Math.floor((subIdx - 1) / 5)  // 0=north, 4=south
    const col = (subIdx - 1) % 5              // 0=west, 4=east

    // Corner order: [SW, SE, NE, NW]
    const [sw, se, ne, nw] = corners

    // NW corner → lattice[row][col]
    if (lattice.x[row][col] === null) {
      lattice.x[row][col] = nw.cassX
      lattice.y[row][col] = nw.cassY
    }
    // NE corner → lattice[row][col+1]
    if (lattice.x[row][col + 1] === null) {
      lattice.x[row][col + 1] = ne.cassX
      lattice.y[row][col + 1] = ne.cassY
    }
    // SW corner → lattice[row+1][col]
    if (lattice.x[row + 1][col] === null) {
      lattice.x[row + 1][col] = sw.cassX
      lattice.y[row + 1][col] = sw.cassY
    }
    // SE corner → lattice[row+1][col+1]
    if (lattice.x[row + 1][col + 1] === null) {
      lattice.x[row + 1][col + 1] = se.cassX
      lattice.y[row + 1][col + 1] = se.cassY
    }
  }

  // Verify all lattice points are filled
  let missing = 0
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (lattice.x[r][c] === null) {
        console.warn(`  Missing lattice point [${r}][${c}]`)
        missing++
      }
    }
  }

  if (missing > 0) {
    throw new Error(`${missing} lattice points missing for sheet ${sheetId}`)
  }

  return {
    x: lattice.x as number[][],
    y: lattice.y as number[][],
  }
}

/**
 * Generate 25 sub-sheets from a 6×6 Cassini lattice and corresponding UTM lattice.
 */
function generateSubSheets(
  cassX: number[][],
  cassY: number[][],
  utmE: number[][],
  utmN: number[][],
): Record<string, CornerPoint[]> {
  const result: Record<string, CornerPoint[]> = {}

  for (let subIdx = 1; subIdx <= 25; subIdx++) {
    const row = Math.floor((subIdx - 1) / 5)  // 0=north, 4=south
    const col = (subIdx - 1) % 5              // 0=west, 4=east

    // Corner order: [SW, SE, NE, NW] matching existing format
    const corners: CornerPoint[] = [
      {
        cassX: cassX[row + 1][col],
        cassY: cassY[row + 1][col],
        utmE: utmE[row + 1][col],
        utmN: utmN[row + 1][col],
      },
      {
        cassX: cassX[row + 1][col + 1],
        cassY: cassY[row + 1][col + 1],
        utmE: utmE[row + 1][col + 1],
        utmN: utmN[row + 1][col + 1],
      },
      {
        cassX: cassX[row][col + 1],
        cassY: cassY[row][col + 1],
        utmE: utmE[row][col + 1],
        utmN: utmN[row][col + 1],
      },
      {
        cassX: cassX[row][col],
        cassY: cassY[row][col],
        utmE: utmE[row][col],
        utmN: utmN[row][col],
      },
    ]

    result[String(subIdx)] = corners
  }

  return result
}

async function main() {
  console.log('P2: Generating synthetic 5×5 sub-sheets for Series 148\n')

  // ── Sheets to generate ──
  const targetSheets: { newId: string; sourceId: string; description: string }[] = [
    {
      newId: '148/2.1',
      sourceId: '148/2',
      description: 'Sheet 148/2.1 — same extent as 148/2, different Helmert params from XLS',
    },
    {
      newId: '148/4.1',
      sourceId: '148/4',
      description: 'Sheet 148/4.1 — same extent as 148/4, different Helmert params from XLS',
    },
  ]

  const output: Record<string, Record<string, CornerPoint[]>> = {}

  for (const target of targetSheets) {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`Processing: ${target.newId}`)
    console.log(`Source lattice: ${target.sourceId}`)
    console.log(`${target.description}`)
    console.log(`${'═'.repeat(60)}`)

    // Step 1: Extract Cassini lattice from source sheet
    const lattice = extractCassiniLattice(target.sourceId)

    // Print lattice bounds
    const xMin = Math.min(...lattice.x.flat())
    const xMax = Math.max(...lattice.x.flat())
    const yMin = Math.min(...lattice.y.flat())
    const yMax = Math.max(...lattice.y.flat())
    console.log(`\nCassini lattice extent:`)
    console.log(`  X: [${xMin.toFixed(1)}, ${xMax.toFixed(1)}]  (span: ${(xMax - xMin).toFixed(1)} ft)`)
    console.log(`  Y: [${yMin.toFixed(1)}, ${yMax.toFixed(1)}]  (span: ${(yMax - yMin).toFixed(1)} ft)`)
    console.log(`  Grid: 6×6 = ${lattice.x.flat().length} lattice points`)

    // Step 2: Convert each lattice point to UTM using exact chain
    const utmLattice: { e: number[][], n: number[][] } = {
      e: Array.from({ length: 6 }, () => Array(6).fill(0)),
      n: Array.from({ length: 6 }, () => Array(6).fill(0)),
    }

    const points = []
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        points.push({
          id: `lattice_${r}_${c}`,
          easting: lattice.x[r][c],
          northing: lattice.y[r][c],
        })
      }
    }

    console.log(`\nConverting ${points.length} lattice points via exact chain + Molodensky...`)
    const results = cassiniFeetToUTMExactWithDatum(points)

    let failures = 0
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const idx = r * 6 + c
        const res = results[idx]
        if (res.utmE === 0 && res.utmN === 0) {
          console.error(`  ERROR: lattice[${r}][${c}] conversion failed: ${res.warning}`)
          failures++
        } else {
          utmLattice.e[r][c] = res.utmE
          utmLattice.n[r][c] = res.utmN
        }
      }
    }

    if (failures > 0) {
      console.error(`\n${failures} lattice point conversions failed!`)
      process.exit(1)
    }

    const eMin = Math.min(...utmLattice.e.flat())
    const eMax = Math.max(...utmLattice.e.flat())
    const nMin = Math.min(...utmLattice.n.flat())
    const nMax = Math.max(...utmLattice.n.flat())
    console.log(`UTM lattice extent:`)
    console.log(`  E: [${eMin.toFixed(1)}, ${eMax.toFixed(1)}]  (span: ${(eMax - eMin).toFixed(1)} m)`)
    console.log(`  N: [${nMin.toFixed(1)}, ${nMax.toFixed(1)}]  (span: ${(nMax - nMin).toFixed(1)} m)`)

    // Step 3: Generate 25 sub-sheets
    const subSheets = generateSubSheets(
      lattice.x, lattice.y,
      utmLattice.e, utmLattice.n,
    )

    output[target.newId] = subSheets
    console.log(`\nGenerated ${Object.keys(subSheets).length} sub-sheets for ${target.newId}`)

    // Print first and last sub-sheet for verification
    const ss1 = subSheets['1']
    const ss25 = subSheets['25']
    console.log(`\nSub-sheet 1 (NW) corners:`)
    for (const [i, c] of ss1.entries()) {
      console.log(`  C${i + 1}: cass(${c.cassX.toFixed(1)}, ${c.cassY.toFixed(1)}) → UTM(${c.utmE.toFixed(4)}, ${c.utmN.toFixed(4)})`)
    }
    console.log(`\nSub-sheet 25 (SE) corners:`)
    for (const [i, c] of ss25.entries()) {
      console.log(`  C${i + 1}: cass(${c.cassX.toFixed(1)}, ${c.cassY.toFixed(1)}) → UTM(${c.utmE.toFixed(4)}, ${c.utmN.toFixed(4)})`)
    }
  }

  // ── Write output JSON ──
  const outputPath = 'src/lib/geo/synthetic_148_subsheets.json'
  const fs = await import('fs')
  fs.writeFileSync(
    outputPath,
    JSON.stringify(output, null, 2),
    'utf-8',
  )
  console.log(`\n\nOutput written to: ${outputPath}`)
  console.log(`Sheets generated: ${Object.keys(output).join(', ')}`)
  console.log(`Total sub-sheets: ${Object.values(output).reduce((s, v) => s + Object.keys(v).length, 0)}`)

  // ── Print merge instructions ──
  console.log(`\nTo merge into merged_subsheets.json, append the contents of synthetic_148_subsheets.json`)
  console.log(`to the top-level object in merged_subsheets.json.`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
