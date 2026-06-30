/**
 * NEW3-PIVOT: Generate synthetic sub-sheets for ALL national sheets.
 *
 * Since A/B polynomial fitting failed (exact chain and XLS reference are in
 * different frames with ~200m systematic offset), we pivot to sub-sheet
 * generation — the approach that gave 148/2.1 and 148/4.1 their 0.00m accuracy.
 *
 * Method:
 * 1. For each national sheet with 4 Cassini corners, generate a 6×6 grid
 *    of interior Cassini coordinates by bilinear interpolation
 * 2. Convert all 36 grid points to UTM via exact chain (Cassini inverse →
 *    Molodensky → TM forward)
 * 3. At the 4 XLS corners, compute bias = XLS_reference - exact_chain
 * 4. Bilinearly interpolate this bias across the 6×6 grid
 * 5. Corrected UTM = exact_chain_UTM + interpolated_bias
 * 6. Compose 25 sub-sheets (5×5 grid) from the 7×7 corrected lattice
 *
 * Each sub-sheet's 4 corners get local Helmert4 transforms, dramatically
 * improving interior accuracy compared to whole-sheet transforms.
 *
 * Usage: cd metardu-repo && npx tsx scripts/generate_national_subsheets.ts
 */

import * as path from 'path'
import * as fs from 'fs'

import { cassiniFeetToUTMExact } from '../src/lib/geo/cassini'
import { NATIONAL_SHEETS } from '../src/lib/geo/national_sheets'

// ─── Configuration ──────────────────────────────────────────────────────

const GRID_SIZE = 5 // 5×5 = 25 sub-sheets → needs 6×6 lattice (36 points)
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'lib', 'geo', 'synthetic_national_subsheets.json')

// ─── Types ──────────────────────────────────────────────────────────────

interface CornerPoint {
  cassX: number
  cassY: number
  utmE: number
  utmN: number
}

// ─── Determine UTM zone and Cassini meridian ──────────────────────────

function determineZoneAndMeridian(sheetId: string): { zone: number; cassiniMeridian: number } {
  const sheetNum = parseInt(sheetId.split('/')[0]) || 0
  if (sheetNum <= 109) {
    return { zone: 36, cassiniMeridian: 37 }
  }
  return { zone: 37, cassiniMeridian: 37 }
}

// ─── Generate 6×6 Cassini lattice from 4 corners ────────────────────

function generateCassiniLattice(sheet: { cassE: number; cassN: number }[]): {
  x: number[][]
  y: number[][]
} {
  // corners order: NW, NE, SE, SW
  const [nw, ne, se, sw] = sheet

  const lattice = { x: [] as number[][], y: [] as number[][] }

  for (let r = 0; r < GRID_SIZE + 1; r++) {
    lattice.x[r] = []
    lattice.y[r] = []
    for (let c = 0; c < GRID_SIZE + 1; c++) {
      // Normalized position: r=0 is north (NW), r=5 is south (SW)
      // c=0 is west (NW/SW), c=5 is east (NE/SE)
      const fracR = r / GRID_SIZE // 0=north, 1=south
      const fracC = c / GRID_SIZE // 0=west, 1=east

      // Bilinear interpolation
      const topX = nw.cassE + (ne.cassE - nw.cassE) * fracC
      const botX = sw.cassE + (se.cassE - sw.cassE) * fracC
      const topY = nw.cassN + (ne.cassN - nw.cassN) * fracC
      const botY = sw.cassN + (se.cassN - sw.cassN) * fracC

      const cassX = topX + (botX - topX) * fracR
      const cassY = topY + (botY - topY) * fracR

      lattice.x[r].push(cassX)
      lattice.y[r].push(cassY)
    }
  }

  return lattice
}

// ─── Convert lattice to UTM via exact chain ──────────────────────────

function convertLatticeToUTM(
  lattice: { x: number[][]; y: number[][] },
  zone: number,
  cassiniMeridian: number,
): { e: number[][]; n: number[][] } {
  const points = []
  for (let r = 0; r < GRID_SIZE + 1; r++) {
    for (let c = 0; c < GRID_SIZE + 1; c++) {
      points.push({
        id: `lattice_${r}_${c}`,
        easting: lattice.x[r][c],
        northing: lattice.y[r][c],
      })
    }
  }

  const results = cassiniFeetToUTMExact(points)

  const utm = { e: [] as number[][], n: [] as number[][] }
  let failures = 0

  for (let r = 0; r < GRID_SIZE + 1; r++) {
    utm.e[r] = []
    utm.n[r] = []
    for (let c = 0; c < GRID_SIZE + 1; c++) {
      const idx = r * (GRID_SIZE + 1) + c
      const res = results[idx]
      if (res.utmE === 0 && res.utmN === 0) {
        failures++
        utm.e[r][c] = 0
        utm.n[r][c] = 0
      } else {
        utm.e[r][c] = res.utmE
        utm.n[r][c] = res.utmN
      }
    }
  }

  return { ...utm, failures }
}

// ─── Apply bilinear bias correction ────────────────────────────────────

function applyBiasCorrection(
  utm: { e: number[][]; n: number[][] },
  corners: { cassE: number; cassN: number; utmE: number; utmN: number }[],
  zone: number,
  cassiniMeridian: number,
): { e: number[][]; n: number[][] } {
  // Step 1: Get exact-chain UTM at the 4 sheet corners
  const cornerResults = cassiniFeetToUTMExact(
    corners.map((cp, i) => ({ id: `corner_${i}`, easting: cp.cassE, northing: cp.cassN })),
    { zone, cassiniMeridianDeg: cassiniMeridian },
  )

  // Step 2: Compute bias at each corner (XLS_ref - exact_chain)
  // Order: NW[0], NE[1], SE[2], SW[3] → lattice positions: [0,0], [0,5], [5,5], [5,0]
  const biasE: number[][] = [
    [0, 0, 0, 0, 0, 0], // row 0 (north): lattice[0][0..5]
    [0, 0, 0, 0, 0, 0], // ...
    [0, 0, 0, 0, 0, 0], // ...
    [0, 0, 0, 0, 0, 0], // row 5 (south): lattice[5][0..5]
  ]
  const biasN: number[][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ]

  const biasPositions = [
    [0, 0], // NW → lattice[0][0]
    [0, 5], // NE → lattice[0][5]
    [5, 5], // SE → lattice[5][5]
    [5, 0], // SW → lattice[5][0]
  ]

  for (let i = 0; i < 4; i++) {
    const [lr, lc] = biasPositions[i]
    biasE[lr][lc] = corners[i].utmE - cornerResults[i].utmE
    biasN[lr][lc] = corners[i].utmN - cornerResults[i].utmN
  }

  // Step 3: Bilinearly interpolate bias across the grid
  const corrected = { e: [] as number[][], n: [] as number[][] }
  for (let r = 0; r < GRID_SIZE + 1; r++) {
    corrected.e[r] = []
    corrected.n[r] = []
    for (let c = 0; c < GRID_SIZE + 1; c++) {
      const fracR = r / GRID_SIZE
      const fracC = c / GRID_SIZE

      // Bilinear interpolation of bias
      const topBE = biasE[0][0] + (biasE[0][5] - biasE[0][0]) * fracC
      const botBE = biasE[5][0] + (biasE[5][5] - biasE[5][0]) * fracC
      const topBN = biasN[0][0] + (biasN[0][5] - biasN[0][0]) * fracC
      const botBN = biasN[5][0] + (biasN[5][5] - biasN[5][0]) * fracC

      const interpBE = topBE + (botBE - topBE) * fracR
      const interpBN = topBN + (botBN - topBN) * fracR

      corrected.e[r][c] = utm.e[r][c] + interpBE
      corrected.n[r][c] = utm.n[r][c] + interpBN
    }
  }

  return corrected
}

// ─── Generate 25 sub-sheets from corrected lattice ─────────────────────

function generateSubSheets(
  cassX: number[][],
  cassY: number[][],
  utmE: number[][],
  utmN: number[][],
): Record<string, CornerPoint[]> {
  const result: Record<string, CornerPoint[]> = {}

  for (let subIdx = 1; subIdx <= 25; subIdx++) {
    const row = Math.floor((subIdx - 1) / 5)
    const col = (subIdx - 1) % 5

    const corners: CornerPoint[] = [
      { cassX: cassX[row + 1][col], cassY: cassY[row + 1][col], utmE: utmE[row + 1][col], utmN: utmN[row + 1][col] },       // SW
      { cassX: cassX[row + 1][col + 1], cassY: cassY[row + 1][col + 1], utmE: utmE[row + 1][col + 1], utmN: utmN[row + 1][col + 1] }, // SE
      { cassX: cassX[row][col + 1], cassY: cassY[row][col + 1], utmE: utmE[row][col + 1], utmN: utmN[row][col + 1] },       // NE
      { cassX: cassX[row][col], cassY: cassY[row][col], utmE: utmE[row][col], utmN: utmN[row][col] },                   // NW
    ]

    result[String(subIdx)] = corners
  }

  return result
}

// ─── Main ──────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════')
console.log('  NEW3-PIVOT: Generate Sub-Sheets for All National Sheets')
console.log('  Method: Exact chain + XLS bias correction → 25 sub-sheets/sheet')
console.log('═══════════════════════════════════════════════════════════════\n')

const output: Record<string, Record<string, CornerPoint[]>> = {}
let totalSubSheets = 0
let errors = 0
let processed = 0

for (const sheet of NATIONAL_SHEETS) {
  if (sheet.commonPoints.length < 4) {
    continue
  }

  // Skip sheets that already have sub-sheets (from 148 series etc.)
  if (sheet.commonPoints.length > 4) {
    continue
  }

  const { zone, cassiniMeridian } = determineZoneAndMeridian(sheet.id)

  try {
    // Step 1: Extract 4 Cassini corners
    const cassCorners = sheet.commonPoints.map(cp => ({
      cassE: cp.cassE,
      cassN: cp.cassN,
      utmE: cp.utmE,
      utmN: cp.utmN,
    }))

    // Step 2: Generate 6×6 Cassini lattice
    const cassLattice = generateCassiniLattice(cassCorners)

    // Step 3: Convert lattice to UTM via exact chain
    const utmLattice = convertLatticeToUTM(cassLattice, zone, cassiniMeridian)

    if (utmLattice.failures && utmLattice.failures > 0) {
      console.error(`  ${sheet.id}: ${utmLattice.failures}/${(GRID_SIZE+1)**2} lattice points failed. Zone=${zone}, CassMeridian=${cassiniMeridian}`)
      console.error(`  Corners: E=[${cassCorners.map(c => c.cassE.toFixed(1)).join(', ')}]`)
      console.error(`  Corners: N=[${cassCorners.map(c => c.cassN.toFixed(1)).join(', ')}]`)
      console.error(`  UTM N:  [${cassCorners.map(c => c.utmN.toFixed(1)).join(', ')}]`)
      errors++
      continue
    }

    // Step 4: Apply XLS bias correction
    const correctedUTM = applyBiasCorrection(utmLattice, cassCorners, zone, cassiniMeridian)

    // Step 5: Generate 25 sub-sheets
    const subSheets = generateSubSheets(
      cassLattice.x, cassLattice.y,
      correctedUTM.e, correctedUTM.n,
    )

    output[sheet.id] = subSheets
    totalSubSheets += 25
    processed++

    if (utmLattice.failures && utmLattice.failures > 0) {
      console.warn(`  ${sheet.id}: ${utmLattice.failures} lattice conversion failures`)
    }
  } catch (err) {
    errors++
    console.error(`  ${sheet.id}: ${(err as Error).message?.slice(0, 200)}`)
  }
}

// ─── Report ──────────────────────────────────────────────────────────────

console.log(`Processed: ${processed} sheets`)
console.log(`Errors:    ${errors} sheets`)
console.log(`Total sub-sheets generated: ${totalSubSheets}`)
console.log(`Sheets: ${Object.keys(output).sort().join(', ')}`)
console.log()

// ─── Write output ──────────────────────────────────────────────────────

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')
console.log(`✅ Saved to: ${OUTPUT_FILE}`)
console.log(`   File size: ${fs.statSync(OUTPUT_FILE).size.toLocaleString()} bytes`)

console.log('\n⚠️  Next steps:')
console.log('   1. Merge into merged_subsheets.json')
console.log('   2. Run validation benchmark')
console.log('   3. The conversion engine auto-computes Helmert4 for each sub-sheet')
console.log('      at runtime via buildSubSheets()')

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('  NEW3-PIVOT Complete')
console.log('═══════════════════════════════════════════════════════════════')
