/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cassini Conversion Engine — Comprehensive Accuracy Benchmark
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests all conversion methods in the Kenyan Cassini-Soldner → UTM engine:
 *   A. Helmert 4-param accuracy for 148-series sheets (with A/B polynomial)
 *   B. Helmert vs Exact chain comparison (quantifies datum offset)
 *   C. WGS84 output comparison (Helmert → utmToWGS84 vs cassiniFeetToWGS84Exact)
 *   D. Sub-sheet coverage report
 *   E. Non-148 sheet accuracy survey
 *
 * Run:  npx tsx scripts/benchmark_cassini.ts
 */

import {
  KENYA_TOPO_SHEETS,
  cassiniFeetToUTM,
  verifyWithCommonPoints,
  estimateSheetAccuracy,
  cassiniFeetToUTMExact,
  cassiniFeetToUTMExactWithDatum,
  cassiniFeetToUTMExact7Param,
  utmToWGS84,
  cassiniFeetToWGS84Exact,
  KENYA_SUB_SHEETS,
  findSubSheet,
  convertCassiniToUTM,
  CLARKE_1858_A_FT,
  CLARKE_1858_B_FT,
  CLARKE_1880_A_M,
  CLARKE_1880_B_M,
  FT_TO_M,
  KENYA_BURSA_WOLF,
  type TopoSheetParams,
  type SubSheetDef,
  type BursaWolfParams,
} from '../src/lib/geo/cassini'

// ─── Helpers ──────────────────────────────────────────────────────────────

const SEP = '─'.repeat(76)
const SEP_THIN = '─'.repeat(56)

function header(title: string) {
  console.log(`\n${SEP}`)
  console.log(`  ${title}`)
  console.log(SEP)
}

function subheader(title: string) {
  console.log(`\n  ${SEP_THIN}`)
  console.log(`  ${title}`)
  console.log(`  ${SEP_THIN}`)
}

function fmt(n: number, decimals = 6): string {
  return n.toFixed(decimals)
}

function fmtSigned(n: number, decimals = 4): string {
  const s = n >= 0 ? '+' : ''
  return s + n.toFixed(decimals)
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST A: Helmert 4-param accuracy for 148-series sheets
// ═══════════════════════════════════════════════════════════════════════════════

function testA() {
  header('TEST A: Helmert 4-param accuracy for 148-series sheets (with A/B polynomial)')

  const sheetIds = ['148/1', '148/2', '148/2.1', '148/3', '148/4', '148/4.1']

  for (const sheetId of sheetIds) {
    const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
    if (!sheet) {
      console.log(`  [WARN] Sheet ${sheetId} not found in KENYA_TOPO_SHEETS`)
      continue
    }

    subheader(`Sheet ${sheetId}`)

    // Print Helmert parameters
    console.log(`    P  = ${sheet.P}`)
    console.log(`    Q  = ${sheet.Q}`)
    console.log(`    Cx = ${sheet.Cx}`)
    console.log(`    Cy = ${sheet.Cy}`)
    console.log(`    A  = ${sheet.A ?? 'N/A'}`)
    console.log(`    B  = ${sheet.B ?? 'N/A'}`)
    console.log(`    Common points: ${sheet.commonPoints.length}`)

    // Run verifyWithCommonPoints
    const verifications = verifyWithCommonPoints(sheet)
    console.log()
    console.log(`    Per-point residuals:`)
    console.log(`    ${padEnd('Station', 12)} ${padEnd('dE (m)', 14)} ${padEnd('dN (m)', 14)} ${padEnd('Total (m)', 14)}`)
    console.log(`    ${'─'.repeat(56)}`)

    for (const v of verifications) {
      const total = Math.sqrt(v.residualE ** 2 + v.residualN ** 2)
      console.log(
        `    ${padEnd(v.station, 12)} ${padEnd(fmtSigned(v.residualE), 14)} ${padEnd(fmtSigned(v.residualN), 14)} ${padEnd(fmt(total), 14)}`,
      )
    }

    // Run estimateSheetAccuracy
    const acc = estimateSheetAccuracy(sheet)
    console.log()
    console.log(`    RMSE: ${acc.rmseM} m  (${acc.rmseMM} mm)`)
    console.log(`    Grade: ${acc.grade}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST B: Helmert vs Exact chain comparison
// ═══════════════════════════════════════════════════════════════════════════════

function testB() {
  header('TEST B: Helmert vs Exact chain comparison (148/1 common points)')

  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === '148/1')
  if (!sheet) {
    console.log('  [ERROR] Sheet 148/1 not found')
    return
  }

  console.log()
  console.log('  Comparing cassiniFeetToUTM (Helmert, per-sheet) vs')
  console.log('            cassiniFeetToUTMExact (exact projection chain, no datum shift)')
  console.log('  The difference quantifies the ~200m datum offset between Clarke 1858→1880.')
  console.log()
  console.log(`  ${padEnd('Station', 12)} ${padEnd('Helmert E', 14)} ${padEnd('Helmert N', 14)} ${padEnd('Exact E', 14)} ${padEnd('Exact N', 14)} ${padEnd('dE', 10)} ${padEnd('dN', 10)} ${padEnd('Total', 10)}`)
  console.log(`  ${'─'.repeat(92)}`)

  for (const cp of sheet.commonPoints) {
    // Helmert method
    const helmert = cassiniFeetToUTM(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
      sheet,
    )[0]

    // Exact method (no sheet params)
    const exact = cassiniFeetToUTMExact(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
    )[0]

    const dE = exact.utmE - helmert.utmE
    const dN = exact.utmN - helmert.utmN
    const total = Math.sqrt(dE * dE + dN * dN)

    console.log(
      `  ${padEnd(cp.station, 12)} ${padEnd(fmt(helmert.utmE, 3), 14)} ${padEnd(fmt(helmert.utmN, 3), 14)} ${padEnd(fmt(exact.utmE, 3), 14)} ${padEnd(fmt(exact.utmN, 3), 14)} ${padEnd(fmtSigned(dE, 2), 10)} ${padEnd(fmtSigned(dN, 2), 10)} ${padEnd(fmt(total, 2), 10)}`,
    )
  }

  console.log()
  console.log('  NOTE: The Exact chain uses "same geodetic coordinates" assumption')
  console.log('  (no Molodensky datum shift). The Helmert parameters implicitly absorb')
  console.log('  the datum correction via least-squares fitting to common points.')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST C: WGS84 output comparison
// ═══════════════════════════════════════════════════════════════════════════════

function testC() {
  header('TEST C: WGS84 output comparison for SKP209')

  const cassE = -130490.6
  const cassN = -348685.6
  const sheetId = '148/1'

  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
  if (!sheet) {
    console.log('  [ERROR] Sheet 148/1 not found')
    return
  }

  // Method 1: Helmert → utmToWGS84
  const helmertResult = cassiniFeetToUTM(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
    sheet,
  )[0]

  const wgs84_m1 = utmToWGS84(helmertResult.utmE, helmertResult.utmN, 37)

  // Method 2: cassiniFeetToWGS84Exact (exact chain + datum shift at the end)
  const wgs84_m2 = cassiniFeetToWGS84Exact(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
  )[0]

  console.log()
  console.log(`  Input: cassE = ${cassE}, cassN = ${cassN} (feet on Clarke 1858)`)
  console.log(`  Sheet: ${sheetId}`)
  console.log()
  console.log(`  Method 1: Helmert 4-param (with A/B) → utmToWGS84 (proj4 Arc1960→WGS84)`)
  console.log(`    UTM: E = ${helmertResult.utmE}, N = ${helmertResult.utmN}`)
  console.log(`    WGS84: lat = ${wgs84_m1.lat.toFixed(10)}°, lon = ${wgs84_m1.lon.toFixed(10)}°`)
  console.log()
  console.log(`  Method 2: cassiniFeetToWGS84Exact (exact chain + proj4 datum shift)`)
  console.log(`    UTM: E = ${wgs84_m2.utmE}, N = ${wgs84_m2.utmN}`)
  console.log(`    WGS84: lat = ${wgs84_m2.lat.toFixed(10)}°, lon = ${wgs84_m2.lon.toFixed(10)}°`)

  // Compute difference in metres (approximate, using equirectangular)
  const dLat = (wgs84_m2.lat - wgs84_m1.lat) * 111320  // metres per degree lat
  const dLon = (wgs84_m2.lon - wgs84_m1.lon) * 111320 * Math.cos(((wgs84_m1.lat + wgs84_m2.lat) / 2) * Math.PI / 180)
  const totalDist = Math.sqrt(dLat * dLat + dLon * dLon)

  console.log()
  console.log(`  Difference (approximate):`)
  console.log(`    dLat = ${(wgs84_m2.lat - wgs84_m1.lat).toFixed(10)}° ≈ ${dLat.toFixed(2)} m`)
  console.log(`    dLon = ${(wgs84_m2.lon - wgs84_m1.lon).toFixed(10)}° ≈ ${dLon.toFixed(2)} m`)
  console.log(`    Total planar distance ≈ ${totalDist.toFixed(2)} m`)
  console.log()
  console.log('  NOTE: The difference arises from the Helmert parameters absorbing datum')
  console.log('  correction locally vs. the exact chain applying a global proj4 shift.')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST D: Sub-sheet coverage report
// ═══════════════════════════════════════════════════════════════════════════════

function testD() {
  header('TEST D: Sub-sheet coverage report')

  const totalSubSheets = KENYA_SUB_SHEETS.length
  const parentSheetIds = [...new Set(KENYA_SUB_SHEETS.map(ss => ss.sheetId))]

  console.log()
  console.log(`  Total sub-sheets in KENYA_SUB_SHEETS: ${totalSubSheets}`)
  console.log(`  Unique parent sheets with sub-sheets: ${parentSheetIds.length}`)
  console.log()
  console.log(`  Parent sheet IDs: ${parentSheetIds.join(', ')}`)

  // Sample a few sub-sheets and report accuracy
  console.log()
  console.log('  Sample sub-sheet accuracy report (first 5 parent sheets):')

  const sampledParents = parentSheetIds.slice(0, 5)
  for (const parentId of sampledParents) {
    const subsForParent = KENYA_SUB_SHEETS.filter(ss => ss.sheetId === parentId)
    const subCount = subsForParent.length
    console.log()

    subheader(`Parent: ${parentId} (${subCount} sub-sheets)`)

    // Test each sub-sheet with its corner points
    for (const ss of subsForParent.slice(0, 3)) {
      // Convert the first corner point using Helmert
      const corner0 = ss.corners[0]
      const helmertResult = cassiniFeetToUTM(
        [{ easting: corner0.cassX, northing: corner0.cassY }],
        ss.helmertParams,
      )[0]

      // Compute residual against known UTM
      const dE = helmertResult.utmE - corner0.utmE
      const dN = helmertResult.utmN - corner0.utmN
      const residual = Math.sqrt(dE * dE + dN * dN)

      console.log(
        `    Sub ${padEnd(ss.fullId, 10)} Corner-0: Helmert dE=${fmtSigned(dE)} dN=${fmtSigned(dN)} total=${residual.toFixed(4)} m`,
      )
    }
    if (subsForParent.length > 3) {
      console.log(`    ... and ${subsForParent.length - 3} more sub-sheets`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST E: Non-148 sheet accuracy survey
// ═══════════════════════════════════════════════════════════════════════════════

function testE() {
  header('TEST E: Non-148 sheet accuracy survey')

  // Filter out 148-series sheets
  const non148Sheets = KENYA_TOPO_SHEETS.filter(s => !s.id.startsWith('148/'))

  // Pick 5 random sheets (deterministic selection for reproducibility)
  const seeds = [0, 7, 23, 47, 89]
  const selected: TopoSheetParams[] = []
  for (const seed of seeds) {
    if (seed < non148Sheets.length) {
      selected.push(non148Sheets[seed])
    }
  }

  console.log()
  console.log(`  Total non-148 sheets available: ${non148Sheets.length}`)
  console.log(`  Sampling ${selected.length} sheets at indices [${seeds.join(', ')}]`)
  console.log()

  let withAB = 0
  let withoutAB = 0

  console.log(`  ${padEnd('Sheet ID', 12)} ${padEnd('Common Pts', 12)} ${padEnd('RMSE (mm)', 12)} ${padEnd('Grade', 12)} ${padEnd('Has A/B', 10)} ${padEnd('P', 16)}`)
  console.log(`  ${'─'.repeat(76)}`)

  for (const sheet of selected) {
    const acc = estimateSheetAccuracy(sheet)
    const hasAB = sheet.A !== undefined && sheet.B !== undefined
    if (hasAB) withAB++
    else withoutAB++

    console.log(
      `  ${padEnd(sheet.id, 12)} ${padEnd(String(sheet.commonPoints.length), 12)} ${padEnd(acc.rmseMM.toFixed(1), 12)} ${padEnd(acc.grade, 12)} ${padEnd(hasAB ? 'YES' : 'no', 10)} ${padEnd(sheet.P.toFixed(12), 16)}`,
    )
  }

  console.log()
  console.log(`  Summary across all ${KENYA_TOPO_SHEETS.length} sheets:`)

  const allWithAB = KENYA_TOPO_SHEETS.filter(s => s.A !== undefined && s.B !== undefined)
  const allWithoutAB = KENYA_TOPO_SHEETS.filter(s => s.A === undefined || s.B === undefined)

  console.log(`    Sheets with A/B coefficients: ${allWithAB.length}`)
  console.log(`    Sheets without A/B coefficients: ${allWithoutAB.length}`)

  // Show grades distribution for non-148 sheets
  const grades: Record<string, number> = { EXCELLENT: 0, GOOD: 0, MODERATE: 0, LOW: 0, UNKNOWN: 0 }
  for (const sheet of non148Sheets) {
    const acc = estimateSheetAccuracy(sheet)
    grades[acc.grade] = (grades[acc.grade] || 0) + 1
  }
  console.log()
  console.log(`  Non-148 grade distribution:`)
  for (const [grade, count] of Object.entries(grades)) {
    if (count > 0) {
      const bar = '█'.repeat(count) + '░'.repeat(Math.max(0, 20 - count))
      console.log(`    ${padEnd(grade, 12)} ${bar} ${count}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST F: Exact + Bursa-Wolf 7-param vs Helmert vs Known Control Points
// ═══════════════════════════════════════════════════════════════════════════════

function testF() {
  header('TEST F: Exact + Bursa-Wolf 7-param vs Helmert vs Known Control Points')

  console.log()
  console.log('  Comparing ALL methods against known UTM coordinates:')
  console.log('    1. Helmert 4-param (per-sheet, with A/B polynomial)')
  console.log('    2. Exact chain (no datum shift — Clarke 1858→1880 same-φλ)')
  console.log('    3. Exact + Molodensky 3-param datum shift')
  console.log('    4. Exact + Bursa-Wolf 7-param datum shift (NEW)')
  console.log()

  // Collect ALL unique common points from 148-series sheets
  const allPoints = new Map<string, { cassE: number; cassN: number; utmE: number; utmN: number; sheet: string }>()
  const sheetIds = ['148/1', '148/2', '148/2.1', '148/3', '148/4', '148/4.1']
  for (const sid of sheetIds) {
    const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sid)
    if (!sheet) continue
    for (const cp of sheet.commonPoints) {
      if (!allPoints.has(cp.station)) {
        allPoints.set(cp.station, { cassE: cp.cassE, cassN: cp.cassN, utmE: cp.utmE, utmN: cp.utmN, sheet: sid })
      }
    }
  }

  console.log(`  Bursa-Wolf parameters (EPSG:1314):`)
  console.log(`    dX=${KENYA_BURSA_WOLF.dX} dY=${KENYA_BURSA_WOLF.dY} dZ=${KENYA_BURSA_WOLF.dZ}`)
  console.log(`    rx=${KENYA_BURSA_WOLF.rx}" ry=${KENYA_BURSA_WOLF.ry}" rz=${KENYA_BURSA_WOLF.rz}"`)
  console.log(`    ds=${KENYA_BURSA_WOLF.ds} ppm`)
  console.log()
  console.log(`  ${padEnd('Station', 12)} ${padEnd('Sheet', 10)} ${padEnd('Known E', 14)} ${padEnd('Known N', 14)} | ${padEnd('Helmert dE', 12)} ${padEnd('Helmert dN', 12)} ${padEnd('Helm. mm', 10)} | ${padEnd('BW7 dE', 12)} ${padEnd('BW7 dN', 12)} ${padEnd('BW7 mm', 10)}`)
  console.log(`  ${'─'.repeat(130)}`)

  let helmertTotalMM = 0
  let bw7TotalMM = 0
  let exactTotalMM = 0
  let moldTotalMM = 0

  const cassPoints = Array.from(allPoints.values())

  for (const pt of cassPoints) {
    // Method 1: Helmert 4-param (use the sheet this point belongs to)
    const sheet = KENYA_TOPO_SHEETS.find(s => s.id === pt.sheet)!
    const helmert = cassiniFeetToUTM([{ easting: pt.cassE, northing: pt.cassN }], sheet)[0]
    const h_dE = helmert.utmE - pt.utmE
    const h_dN = helmert.utmN - pt.utmN
    const h_mm = Math.sqrt(h_dE * h_dE + h_dN * h_dN) * 1000

    // Method 2: Exact (no datum shift)
    const exact = cassiniFeetToUTMExact([{ easting: pt.cassE, northing: pt.cassN }])[0]
    const e_dE = exact.utmE - pt.utmE
    const e_dN = exact.utmN - pt.utmN
    const e_mm = Math.sqrt(e_dE * e_dE + e_dN * e_dN) * 1000

    // Method 3: Exact + Molodensky 3-param
    const mold = cassiniFeetToUTMExactWithDatum([{ easting: pt.cassE, northing: pt.cassN }])[0]
    const m_dE = mold.utmE - pt.utmE
    const m_dN = mold.utmN - pt.utmN
    const m_mm = Math.sqrt(m_dE * m_dE + m_dN * m_dN) * 1000

    // Method 4: Exact + Bursa-Wolf 7-param
    const bw7 = cassiniFeetToUTMExact7Param([{ easting: pt.cassE, northing: pt.cassN }])[0]
    const bw_dE = bw7.utmE - pt.utmE
    const bw_dN = bw7.utmN - pt.utmN
    const bw_mm = Math.sqrt(bw_dE * bw_dE + bw_dN * bw_dN) * 1000

    helmertTotalMM += h_mm
    bw7TotalMM += bw_mm
    exactTotalMM += e_mm
    moldTotalMM += m_mm

    console.log(
      `  ${padEnd(pt.cassE > 0 ? '' : '', 12)} ${padEnd(pt.sheet, 10)} ${padEnd(fmt(pt.utmE, 3), 14)} ${padEnd(fmt(pt.utmN, 3), 14)} | ${padEnd(fmtSigned(h_dE, 1) + 'm', 12)} ${padEnd(fmtSigned(h_dN, 1) + 'm', 12)} ${padEnd(h_mm.toFixed(1), 10)} | ${padEnd(fmtSigned(bw_dE, 1) + 'm', 12)} ${padEnd(fmtSigned(bw_dN, 1) + 'm', 12)} ${padEnd(bw_mm.toFixed(1), 10)}`,
    )
  }

  const n = cassPoints.length
  console.log(`  ${'─'.repeat(130)}`)
  console.log()
  console.log(`  SUMMARY — Average residuals against known UTM coordinates (${n} points):`)
  console.log(`    Helmert 4-param (with A/B):      ${(helmertTotalMM / n).toFixed(1)} mm  (${(helmertTotalMM / n / 1000).toFixed(4)} m)`)
  console.log(`    Exact chain (no datum):          ${(exactTotalMM / n).toFixed(1)} mm  (${(exactTotalMM / n / 1000).toFixed(4)} m)`)
  console.log(`    Exact + Molodensky 3-param:      ${(moldTotalMM / n).toFixed(1)} mm  (${(moldTotalMM / n / 1000).toFixed(4)} m)`)
  console.log(`    Exact + Bursa-Wolf 7-param:       ${(bw7TotalMM / n).toFixed(1)} mm  (${(bw7TotalMM / n / 1000).toFixed(4)} m)`)
  console.log()
  console.log('  NOTE: The Bursa-Wolf 7-param uses EPSG:1314 parameters which model')
  console.log('  Arc 1960 → WGS84. For Clarke 1858 → Clarke 1880 (within Arc 1960),')
  console.log('  the Helmert per-sheet params will likely still outperform because')
  console.log('  they are fitted to local control points. The 7-param becomes more')
  console.log('  valuable for sheets WITHOUT local Helmert parameters.')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Ellipsoid constants report
// ═══════════════════════════════════════════════════════════════════════════════

function printEllipsoidConstants() {
  header('Ellipsoid Constants Reference')

  console.log()
  console.log(`  Clarke 1858 (source ellipsoid for Cassini-Soldner):`)
  console.log(`    Semi-major axis: ${CLARKE_1858_A_FT.toLocaleString()} feet (${(CLARKE_1858_A_FT * FT_TO_M).toFixed(4)} m)`)
  console.log(`    Semi-minor axis: ${CLARKE_1858_B_FT.toLocaleString()} feet (${(CLARKE_1858_B_FT * FT_TO_M).toFixed(4)} m)`)
  console.log()
  console.log(`  Clarke 1880 / Arc 1960 (target ellipsoid for UTM):`)
  console.log(`    Semi-major axis: ${CLARKE_1880_A_M.toLocaleString()} m`)
  console.log(`    Semi-minor axis: ${CLARKE_1880_B_M.toLocaleString()} m`)
  console.log()
  console.log(`  Foot-metre conversion: ${FT_TO_M}`)
  console.log()
  console.log(`  Cassini-Soldner origin: 37°E, Equator`)
  console.log(`  UTM Zone 37S central meridian: 39°E, scale 0.9996, FE=500,000, FN=10,000,000`)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════════════╗')
console.log('║  CASSINI CONVERSION ENGINE — ACCURACY BENCHMARK                      ║')
console.log('║  Kenyan Cassini-Soldner (Clarke 1858) → UTM (Clarke 1880 / Arc 1960) ║')
console.log('╚══════════════════════════════════════════════════════════════════════════╝')

console.log(`\n  Sheets loaded: ${KENYA_TOPO_SHEETS.length}`)
console.log(`  Sub-sheets loaded: ${KENYA_SUB_SHEETS.length}`)
console.log(`  Node.js: ${process.version}`)

const startTime = Date.now()

printEllipsoidConstants()
testA()
testB()
testC()
testD()
testE()
testF()

const elapsed = Date.now() - startTime

console.log(`\n${SEP}`)
console.log(`  BENCHMARK COMPLETE — elapsed: ${elapsed}ms`)
console.log(SEP)
console.log()
