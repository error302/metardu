/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Molodensky-Corrected Exact Chain — Focused Test Suite
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the Molodensky-corrected exact projection chain for the Kenyan
 * Cassini-Soldner → UTM conversion.
 *
 * Run:  npx tsx --tsconfig /home/z/my-project/metardu-repo/tsconfig.json \
 *        /home/z/my-project/metardu-repo/scripts/test_molodensky_exact.ts
 */

import {
  cassiniFeetToUTM,
  cassiniFeetToUTMExact,
  cassiniFeetToUTMExactWithDatum,
  utmToWGS84,
  KENYA_TOPO_SHEETS,
  getMolodenskyParams,
  type CommonPoint,
  type TopoSheetParams,
} from '../src/lib/geo/cassini'

// ─── Helpers ──────────────────────────────────────────────────────────────

const SEP = '─'.repeat(80)
const SEP_THIN = '─'.repeat(60)

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

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

function padL(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str
}

function fmtSigned(n: number, d = 4): string {
  return (n >= 0 ? '+' : '') + n.toFixed(d)
}

function residual(dE: number, dN: number): number {
  return Math.sqrt(dE * dE + dN * dN)
}

// Collect all unique common points across 148-series sheets
function get148CommonPoints(): CommonPoint[] {
  const seen = new Map<string, CommonPoint>()
  const sheet148Ids = ['148/1', '148/2', '148/2.1', '148/3', '148/4', '148/4.1']
  for (const sheetId of sheet148Ids) {
    const sheet = KENYA_TOPO_SHEETS.find(s => s.id === sheetId)
    if (sheet) {
      for (const cp of sheet.commonPoints) {
        seen.set(cp.station, cp)
      }
    }
  }
  return Array.from(seen.values())
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 1: Molodensky Parameter Report
// ═══════════════════════════════════════════════════════════════════════════════

function test1() {
  header('TEST 1: Molodensky Parameter Report')

  const params = getMolodenskyParams()

  console.log()
  console.log(`  Molodensky 3-parameter datum shift: Clarke 1858 → Clarke 1880`)
  console.log(`  (Derived from all 148-series common points via least-squares)`)
  console.log()
  console.log(`    dX = ${params.dX.toFixed(4)} m`)
  console.log(`    dY = ${params.dY.toFixed(4)} m`)
  console.log(`    dZ = ${params.dZ.toFixed(4)} m`)
  console.log()
  console.log(`  RMSE of derivation: ${params.rmse.toFixed(6)} m (${(params.rmse * 1000).toFixed(4)} mm)`)
  console.log()
  console.log(`  Per-point residuals (computed by running full Molodensky + TM chain):`)
  console.log(`  ${pad('Station', 12)} ${pad('dE (m)', 16)} ${pad('dN (m)', 16)} ${pad('Total (m)', 16)}`)
  console.log(`  ${'─'.repeat(62)}`)

  for (const r of params.residuals) {
    const total = residual(r.dE, r.dN)
    console.log(
      `  ${pad(r.station, 12)} ${pad(fmtSigned(r.dE), 16)} ${pad(fmtSigned(r.dN), 16)} ${pad(total.toFixed(6), 16)}`,
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 2: 4-method comparison at SKP209
// ═══════════════════════════════════════════════════════════════════════════════

function test2() {
  header('TEST 2: 4-method comparison at SKP209')

  const cassE = -130490.6
  const cassN = -348685.6
  const knownE = 237730.756
  const knownN = 9893875.453

  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === '148/1')
  if (!sheet) {
    console.log('  [ERROR] Sheet 148/1 not found')
    return
  }

  console.log()
  console.log(`  Input: SKP209 (cassE=${cassE}, cassN=${cassN})`)
  console.log()

  // Method A: Helmert 4-param (148/1 params)
  const mA = cassiniFeetToUTM(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
    sheet,
  )[0]

  // Method B: Exact chain (no datum shift)
  const mB = cassiniFeetToUTMExact(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
  )[0]

  // Method C: Exact chain WITH Molodensky
  const mC = cassiniFeetToUTMExactWithDatum(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
  )[0]

  // Method D: Known UTM
  console.log(`  ${pad('Method', 52)} ${pad('UTM E', 16)} ${pad('UTM N', 16)}`)
  console.log(`  ${'─'.repeat(86)}`)
  console.log(`  ${pad('A: Helmert 4-param (148/1 params)', 52)} ${pad(mA.utmE.toFixed(3), 16)} ${pad(mA.utmN.toFixed(3), 16)}`)
  console.log(`  ${pad('B: Exact chain (no datum shift)', 52)} ${pad(mB.utmE.toFixed(3), 16)} ${pad(mB.utmN.toFixed(3), 16)}`)
  console.log(`  ${pad('C: Exact chain WITH Molodensky', 52)} ${pad(mC.utmE.toFixed(3), 16)} ${pad(mC.utmN.toFixed(3), 16)}`)
  console.log(`  ${pad('D: Known UTM (survey data)', 52)} ${pad(knownE.toFixed(3), 16)} ${pad(knownN.toFixed(3), 16)}`)

  console.log()
  console.log(`  Residuals from Method D (known UTM):`)
  console.log(`  ${pad('Method', 10)} ${pad('dE (m)', 14)} ${pad('dN (m)', 14)} ${pad('Total (m)', 14)}`)
  console.log(`  ${'─'.repeat(54)}`)

  for (const [label, r] of [
    ['A (Helmert)', mA],
    ['B (Exact)', mB],
    ['C (Exact+Mol)', mC],
  ] as const) {
    const dE = r.utmE - knownE
    const dN = r.utmN - knownN
    const total = residual(dE, dN)
    console.log(`  ${pad(label, 10)} ${pad(fmtSigned(dE), 14)} ${pad(fmtSigned(dN), 14)} ${pad(total.toFixed(4), 14)}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 3: 4-method comparison at ALL 148-series common points
// ═══════════════════════════════════════════════════════════════════════════════

function test3() {
  header('TEST 3: 4-method comparison at ALL 148-series common points')

  const commonPoints = get148CommonPoints()
  console.log(`  Unique common points across all 148-series sheets: ${commonPoints.length}`)

  // For each point, try each 148 sheet it appears in
  // Build a map: station → first sheet that contains it
  const stationToSheet = new Map<string, TopoSheetParams>()
  for (const cp of commonPoints) {
    if (!stationToSheet.has(cp.station)) {
      const sheet = KENYA_TOPO_SHEETS.find(s =>
        s.id.startsWith('148/') && s.commonPoints.some(p => p.station === cp.station),
      )
      if (sheet) {
        stationToSheet.set(cp.station, sheet)
      }
    }
  }

  console.log()
  console.log(`  ${pad('Station', 10)} ${pad('Sheet', 10)} ${pad('Helmert dE', 12)} ${pad('Helmert dN', 12)} ${pad('Helmert Tot', 12)} ${pad('Exact dE', 12)} ${pad('Exact dN', 12)} ${pad('Exact Tot', 12)} ${pad('Exact+Mol dE', 14)} ${pad('Exact+Mol dN', 14)} ${pad('Exact+Mol Tot', 14)}`)
  console.log(`  ${'─'.repeat(128)}`)

  let helmertSsr = 0
  let exactSsr = 0
  let exactMolSsr = 0

  for (const cp of commonPoints) {
    // Method A: Helmert (using first matching sheet)
    const sheet = stationToSheet.get(cp.station)
    let mA = { utmE: 0, utmN: 0 }
    if (sheet) {
      mA = cassiniFeetToUTM(
        [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
        sheet,
      )[0]
    }

    // Method B: Exact (no datum)
    const mB = cassiniFeetToUTMExact(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
    )[0]

    // Method C: Exact + Molodensky
    const mC = cassiniFeetToUTMExactWithDatum(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
    )[0]

    const hDE = mA.utmE - cp.utmE
    const hDN = mA.utmN - cp.utmN
    const hTot = residual(hDE, hDN)

    const eDE = mB.utmE - cp.utmE
    const eDN = mB.utmN - cp.utmN
    const eTot = residual(eDE, eDN)

    const mDE = mC.utmE - cp.utmE
    const mDN = mC.utmN - cp.utmN
    const mTot = residual(mDE, mDN)

    helmertSsr += hDE * hDE + hDN * hDN
    exactSsr += eDE * eDE + eDN * eDN
    exactMolSsr += mDE * mDE + mDN * mDN

    console.log(
      `  ${pad(cp.station, 10)} ${pad(sheet?.id ?? '-', 10)} ${pad(fmtSigned(hDE, 2), 12)} ${pad(fmtSigned(hDN, 2), 12)} ${pad(hTot.toFixed(3), 12)} ${pad(fmtSigned(eDE, 2), 12)} ${pad(fmtSigned(eDN, 2), 12)} ${pad(eTot.toFixed(3), 12)} ${pad(fmtSigned(mDE, 2), 14)} ${pad(fmtSigned(mDN, 2), 14)} ${pad(mTot.toFixed(3), 14)}`,
    )
  }

  const n = commonPoints.length
  const helmertRMSE = Math.sqrt(helmertSsr / (2 * n))
  const exactRMSE = Math.sqrt(exactSsr / (2 * n))
  const exactMolRMSE = Math.sqrt(exactMolSsr / (2 * n))

  console.log()
  console.log(`  Summary RMSE (${n} points):`)
  console.log(`    Method A (Helmert):        ${helmertRMSE.toFixed(4)} m  (${(helmertRMSE * 1000).toFixed(1)} mm)`)
  console.log(`    Method B (Exact no datum): ${exactRMSE.toFixed(4)} m  (${(exactRMSE * 1000).toFixed(1)} mm)`)
  console.log(`    Method C (Exact+Molodensky): ${exactMolRMSE.toFixed(4)} m  (${(exactMolRMSE * 1000).toFixed(1)} mm)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST 4: WGS84 comparison for SKP209
// ═══════════════════════════════════════════════════════════════════════════════

function test4() {
  header('TEST 4: WGS84 comparison for SKP209')

  const cassE = -130490.6
  const cassN = -348685.6

  const sheet = KENYA_TOPO_SHEETS.find(s => s.id === '148/1')
  if (!sheet) {
    console.log('  [ERROR] Sheet 148/1 not found')
    return
  }

  console.log()
  console.log(`  Input: SKP209 (cassE=${cassE}, cassN=${cassN})`)
  console.log()

  // Method A: Helmert → utmToWGS84
  const helmertUTM = cassiniFeetToUTM(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
    sheet,
  )[0]

  const wgs84_A = utmToWGS84(helmertUTM.utmE, helmertUTM.utmN, 37)

  // Method C: Exact+Molodensky → utmToWGS84
  const exactMolUTM = cassiniFeetToUTMExactWithDatum(
    [{ id: 'SKP209', easting: cassE, northing: cassN }],
  )[0]

  const wgs84_C = utmToWGS84(exactMolUTM.utmE, exactMolUTM.utmN, 37)

  console.log(`  ${pad('Method', 30)} ${pad('Lat (°)', 22)} ${pad('Lon (°)', 22)}`)
  console.log(`  ${'─'.repeat(76)}`)
  console.log(`  ${pad('A: Helmert → utmToWGS84', 30)} ${pad(wgs84_A.lat.toFixed(12), 22)} ${pad(wgs84_A.lon.toFixed(12), 22)}`)
  console.log(`  ${pad('C: Exact+Molodensky → utmToWGS84', 30)} ${pad(wgs84_C.lat.toFixed(12), 22)} ${pad(wgs84_C.lon.toFixed(12), 22)}`)

  // Difference in metres (equirectangular approximation)
  const avgLat = ((wgs84_A.lat + wgs84_C.lat) / 2) * Math.PI / 180
  const dLat_m = (wgs84_C.lat - wgs84_A.lat) * 111320
  const dLon_m = (wgs84_C.lon - wgs84_A.lon) * 111320 * Math.cos(avgLat)
  const totalDist = Math.sqrt(dLat_m * dLat_m + dLon_m * dLon_m)

  console.log()
  console.log(`  Difference (Method C minus Method A):`)
  console.log(`    dLat = ${(wgs84_C.lat - wgs84_A.lat).toFixed(12)}°  ≈  ${dLat_m.toFixed(4)} m`)
  console.log(`    dLon = ${(wgs84_C.lon - wgs84_A.lon).toFixed(12)}°  ≈  ${dLon_m.toFixed(4)} m`)
  console.log(`    Total planar distance ≈ ${totalDist.toFixed(4)} m`)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════════

console.log('╔════════════════════════════════════════════════════════════════════════════════════╗')
console.log('║  MOLODENSKY-CORRECTED EXACT CHAIN — FOCUSED TEST SUITE                            ║')
console.log('║  Kenyan Cassini-Soldner (Clarke 1858) → UTM (Clarke 1880 / Arc 1960) → WGS84     ║')
console.log('╚════════════════════════════════════════════════════════════════════════════════════╝')

console.log(`\n  Sheets loaded: ${KENYA_TOPO_SHEETS.length}`)
console.log(`  Node.js: ${process.version}`)

const startTime = Date.now()

test1()
test2()
test3()
test4()

const elapsed = Date.now() - startTime

console.log(`\n${SEP}`)
console.log(`  ALL TESTS COMPLETE — elapsed: ${elapsed}ms`)
console.log(SEP)
console.log()
