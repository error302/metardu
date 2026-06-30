/**
 * Cassini Golden Master — capture outputs of every public function on fixed inputs.
 * ponytail: one runnable check, the smallest thing that fails if the logic breaks.
 *
 * Run BEFORE refactor:  npx tsx scripts/cassini_golden_master.ts > golden_before.json
 * Run AFTER refactor:   npx tsx scripts/cassini_golden_master.ts > golden_after.json
 * Diff:                 python3 scripts/golden_diff.py golden_before.json golden_after.json
 */

import {
  KENYA_TOPO_SHEETS,
  cassiniFeetToUTM,
  utmToCassiniFeet,
  cassiniFeetToUTMExact,
  cassiniFeetToUTMExactWithDatum,
  cassiniFeetToUTMExact7Param,
  utmToCassiniFeetExact,
  cassiniFeetToWGS84Exact,
  applyConformalCorrection,
  computeABCoefficients,
  computeHelmert4Params,
  computeAffine6Params,
  computePoly12Params,
  molodenskyTransform,
  deriveMolodenskyParams,
  getMolodenskyParams,
  verifyWithCommonPoints,
  verifyAffine6Params,
  verifyPoly12Params,
  utmToWGS84,
  toDMS,
  estimateSheetAccuracy,
  findTopoSheet,
  estimateSubSheetAccuracy,
  KENYA_SUB_SHEETS,
  SHEETS_WITH_SUBSHEETS,
  findSubSheet,
  getSubSheetGrid,
  getUtmZone,
  convertCassiniToUTM,
  convertUTMToCassini,
  CLARKE_1858_A_FT,
  CLARKE_1880_A_M,
} from '../src/lib/geo/cassini'

function r(n: number | undefined, d = 12): number | string {
  if (n === undefined || n === null || !isFinite(n)) return 'NaN'
  return Number(n.toFixed(d))
}

function roundDeep<T>(obj: T): T {
  if (typeof obj === 'number') return r(obj) as unknown as T
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(roundDeep) as unknown as T
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      out[k] = roundDeep((obj as Record<string, unknown>)[k])
    }
    return out as unknown as T
  }
  return obj
}

const TEST_POINTS: { sheet: string; e: number; n: number }[] = [
  { sheet: '148/2',     e: 100000,    n: -50000  },
  { sheet: '148/2',     e: 200000,    n: 100000  },
  { sheet: '148/2',     e: 0,         n: 0       },
  { sheet: '148/3',     e: 150000,    n: 75000   },
  { sheet: '148/3',     e: 99999.999, n: -0.001  },
  { sheet: '148/4',     e: 50000,     n: 200000  },
  { sheet: '148/1',     e: 175000,    n: 125000  },
  { sheet: '148/2.1',   e: 123456.789, n: -65432.1 },
  { sheet: '148/4.1',   e: 99999,     n: 99999   },
  ...(KENYA_TOPO_SHEETS.slice(0, 3).map(s => ({
    sheet: s.id, e: 100000, n: 50000,
  }))),
]

const out: Record<string, unknown> = {}

out._meta = {
  // NOTE: timestamp is informational only; the diff script strips it.
  timestamp: new Date().toISOString(),
  kenyaSheetsCount: KENYA_TOPO_SHEETS.length,
  kenyaSubSheetsCount: KENYA_SUB_SHEETS.length,
  sheetsWithSubSheetsCount: SHEETS_WITH_SUBSHEETS.size,
  firstSheetId: KENYA_TOPO_SHEETS[0]?.id,
  lastSheetId: KENYA_TOPO_SHEETS[KENYA_TOPO_SHEETS.length - 1]?.id,
  clarke1858A: CLARKE_1858_A_FT,
  clarke1880A: CLARKE_1880_A_M,
}

out.applyConformalCorrection = {
  zero: r(applyConformalCorrection(0)),
  positive: r(applyConformalCorrection(100000)),
  large: r(applyConformalCorrection(500000)),
}

const sheet148_2 = KENYA_TOPO_SHEETS.find(s => s.id === '148/2')!
out.computeHelmert4Params_148_2 = roundDeep(computeHelmert4Params(sheet148_2.commonPoints))
out.computeABCoefficients_148_2 = roundDeep(computeABCoefficients(sheet148_2))
out.estimateSheetAccuracy_148_2 = roundDeep(estimateSheetAccuracy(sheet148_2))

out.cassiniFeetToUTM = TEST_POINTS.map(p => {
  const sheet = findTopoSheet(p.sheet)
  if (!sheet) return { sheet: p.sheet, error: 'sheet not found' }
  const results = cassiniFeetToUTM([{ id: 'P1', easting: p.e, northing: p.n }], sheet)
  return roundDeep({
    sheet: p.sheet,
    input: { e: p.e, n: p.n },
    helmert: results[0],
  })
})

out.utmToCassiniFeet_roundtrip = TEST_POINTS.slice(0, 3).map(p => {
  const sheet = findTopoSheet(p.sheet)
  if (!sheet) return { sheet: p.sheet, error: 'sheet not found' }
  const fwd = cassiniFeetToUTM([{ id: 'P1', easting: p.e, northing: p.n }], sheet)[0]
  const back = utmToCassiniFeet([{ id: 'P1', easting: fwd.utmE, northing: fwd.utmN }], sheet)[0]
  return roundDeep({ sheet: p.sheet, original: { e: p.e, n: p.n }, roundtrip: back })
})

const wrapPts = (e: number, n: number) => [{ id: 'P1', easting: e, northing: n }]
const wrapUtm = (e: number, n: number) => [{ id: 'P1', easting: e, northing: n }]

out.cassiniFeetToUTMExact = TEST_POINTS.slice(0, 5).map(p => roundDeep({
  sheet: p.sheet,
  input: { e: p.e, n: p.n },
  exact: cassiniFeetToUTMExact(wrapPts(p.e, p.n))[0],
}))

out.cassiniFeetToUTMExactWithDatum = TEST_POINTS.slice(0, 5).map(p => roundDeep({
  sheet: p.sheet,
  input: { e: p.e, n: p.n },
  exactDatum: cassiniFeetToUTMExactWithDatum(wrapPts(p.e, p.n))[0],
}))

out.cassiniFeetToUTMExact7Param = TEST_POINTS.slice(0, 3).map(p => roundDeep({
  sheet: p.sheet,
  input: { e: p.e, n: p.n },
  exact7: cassiniFeetToUTMExact7Param(wrapPts(p.e, p.n))[0],
}))

out.cassiniFeetToWGS84Exact = TEST_POINTS.slice(0, 3).map(p => roundDeep({
  sheet: p.sheet,
  input: { e: p.e, n: p.n },
  wgs84: cassiniFeetToWGS84Exact(wrapPts(p.e, p.n))[0],
}))

out.utmToCassiniFeetExact_roundtrip = TEST_POINTS.slice(0, 3).map(p => roundDeep({
  sheet: p.sheet,
  original: { e: p.e, n: p.n },
  roundtrip: (() => {
    const fwd = cassiniFeetToUTMExact(wrapPts(p.e, p.n))[0]
    return utmToCassiniFeetExact(wrapUtm(fwd.utmE, fwd.utmN))[0]
  })(),
}))

const molParams = getMolodenskyParams()
out.molodenskyTransform = roundDeep(molodenskyTransform(0, 0, 0, molParams.dX, molParams.dY, molParams.dZ))
out.bursaWolfTransform_skipped = 'requires EllipsoidParams — covered by cassiniFeetToUTMExact7Param test'
out.deriveMolodenskyParams = roundDeep(deriveMolodenskyParams(sheet148_2.commonPoints))
out.getMolodenskyParams = roundDeep(getMolodenskyParams())

out.computeAffine6Params_148_2 = roundDeep(computeAffine6Params(sheet148_2.commonPoints))
out.verifyAffine6Params_148_2 = roundDeep(verifyAffine6Params({
  ...computeAffine6Params(sheet148_2.commonPoints),
  id: '148/2', name: 'test',
}))
out.computePoly12Params_148_2 = (() => {
  try {
    return roundDeep(computePoly12Params(sheet148_2.commonPoints))
  } catch (e) {
    return { error: (e as Error).message }
  }
})()

out.verifyWithCommonPoints_148_2 = roundDeep(verifyWithCommonPoints(sheet148_2))

out.utmToWGS84_zone37 = roundDeep(utmToWGS84(500000, 10000000, 37))
out.utmToWGS84_zone36 = roundDeep(utmToWGS84(500000, 10000000, 36))
out.toDMS_lat = toDMS(-1.286389, true)
out.toDMS_lon = toDMS(36.81722, false)

out.findTopoSheet_148_2 = roundDeep(findTopoSheet('148/2'))
out.findTopoSheet_nonexistent = findTopoSheet('999/9')
out.getUtmZone_148_2 = getUtmZone('148/2')
out.getUtmZone_123_4 = getUtmZone('123/4')

out.findSubSheet_148_2 = roundDeep(findSubSheet('148/2', 100000, -50000))
out.getSubSheetGrid_148_2_shape = (() => {
  const grid = getSubSheetGrid('148/2')
  return { rows: grid.length, cols: grid[0]?.length ?? 0,
           totalNonNull: grid.flat().filter(Boolean).length }
})()
if (KENYA_SUB_SHEETS.length > 0) {
  out.estimateSubSheetAccuracy_first = roundDeep(estimateSubSheetAccuracy(KENYA_SUB_SHEETS[0]))
}

out.convertCassiniToUTM_helmert4 = TEST_POINTS.slice(0, 3).map(p => {
  const sheet = findTopoSheet(p.sheet)
  if (!sheet) return { sheet: p.sheet, error: 'sheet not found' }
  const result = convertCassiniToUTM(wrapPts(p.e, p.n), sheet, 'helmert4')
  return roundDeep({ sheet: p.sheet, input: { e: p.e, n: p.n }, result: result[0] })
})
out.convertCassiniToUTM_affine6 = TEST_POINTS.slice(0, 3).map(p => {
  const sub = findSubSheet(p.sheet, p.e, p.n)
  if (!sub) return { sheet: p.sheet, note: 'no sub-sheet at this point — skipped' }
  const result = convertCassiniToUTM(wrapPts(p.e, p.n), sub, 'affine6')
  return roundDeep({ sheet: p.sheet, input: { e: p.e, n: p.n }, result: result[0] })
})
out.convertUTMToCassini_helmert4 = TEST_POINTS.slice(0, 3).map(p => {
  const sheet = findTopoSheet(p.sheet)
  if (!sheet) return { sheet: p.sheet, error: 'sheet not found' }
  const fwd = cassiniFeetToUTM(wrapPts(p.e, p.n), sheet)[0]
  const result = convertUTMToCassini(wrapUtm(fwd.utmE, fwd.utmN), sheet, 'helmert4')
  return roundDeep({
    sheet: p.sheet,
    utm: { e: fwd.utmE, n: fwd.utmN },
    result: result[0],
  })
})

const ordered: Record<string, unknown> = {}
for (const k of Object.keys(out).sort()) ordered[k] = out[k]
console.log(JSON.stringify(ordered, null, 2))
