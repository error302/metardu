import { computeTraverse, type RawObservation } from '../traverseEngine'
import { generateTraverseSheet } from '@/lib/print/traverseSheet'
import { computeMeanAngleDMS } from '@/lib/survey/adapter'

const shot = (patch: Partial<RawObservation> = {}): RawObservation => ({
  station: 'B', bs: 'BACK', fs: 'B',
  hclDeg: '0', hclMin: '0', hclSec: '0',
  hcrDeg: '180', hcrMin: '0', hcrSec: '0',
  slopeDist: '100', vaDeg: '90', vaMin: '0', vaSec: '0', ih: '1.5', th: '1.5',
  ...patch,
})
const input = (observations = [shot()]) => ({
  openingEasting: 0, openingNorthing: 0, openingStation: 'A',
  backsightBearingDeg: 0, backsightBearingMin: 0, backsightBearingSec: 0,
  observations,
})

describe('traverse observation and evidence integrity', () => {
  it('does not invent reduced levels without an opening level', () => {
    const result = computeTraverse(input([shot({ vaDeg: '60' })]))
    expect(result.coordinates.every(c => c.rl === undefined)).toBe(true)
  })

  it('retains an explicitly known zero opening level', () => {
    const result = computeTraverse({ ...input([shot({ vaDeg: '60' })]), openingRL: 0 })
    expect(result.coordinates[0].rl).toBe(0)
    expect(result.coordinates[1].rl).toBeCloseTo(50, 10)
  })

  it.each(['ih', 'th'] as const)('keeps missing %s and all subsequent levels unknown', field => {
    const observations = [shot({ [field]: '' }), shot({ station: 'C' })]
    const result = computeTraverse({ ...input(observations), openingRL: 0 })
    expect(result.observations[0][field]).toBeNull()
    expect(result.observations[0].deltaH).toBeNull()
    expect(result.coordinates.slice(1).every(c => c.rl === undefined)).toBe(true)
  })

  it('averages agreeing face readings across the 360-degree seam', () => {
    const result = computeTraverse(input([shot({ hclDeg: '359', hclMin: '59', hcrDeg: '180', hcrMin: '1' })]))
    expect(result.legs[0].wcb).toBeCloseTo(0, 10)
    expect(result.coordinates[1].northing).toBeCloseTo(100, 10)
  })

  it('shows the same north-crossing mean in the field-book preview', () => {
    expect(computeMeanAngleDMS('359','59','0','180','1','0').replace(/\s/g, '')).toBe('000°00\'0.0"')
    expect(computeMeanAngleDMS('90','','','270','0','0')).toBe('—')
  })

  it('includes the exact stated limit in the numerical comparison', () => {
    const request = { ...input(), closingEasting: 0, closingNorthing: 100.125, criterion: { allowableMisclosureMm: 125, reference: 'Synthetic exact binary boundary' } }
    expect(computeTraverse(request)).toMatchObject({ C_mm: 125, assessment: { status: 'pass' } })
  })

  it('rejects an ambiguous opposite face pair', () => {
    expect(() => computeTraverse(input([shot({ hcrDeg: '0' })]))).toThrow(/face|ambiguous/i)
  })

  it.each<Partial<RawObservation>>([
    { station: '' }, { slopeDist: '' }, { slopeDist: '100m' }, { slopeDist: 'NaN' },
    { slopeDist: 'Infinity' }, { slopeDist: '0x64' }, { slopeDist: '-1' }, { slopeDist: '0' },
    { hclDeg: '' }, { hclDeg: '90.5' }, { hclMin: '60' }, { hcrSec: '60' },
    { vaDeg: '181' }, { vaDeg: '0' }, { vaDeg: '180' }, { vaMin: '-1' }, { ih: '1.5m' },
  ])('refuses an incomplete or malformed shot: %j', patch => {
    expect(() => computeTraverse(input([shot(), shot({ station: 'C', ...patch })]))).toThrow()
  })

  it('requires both closing coordinate components', () => {
    expect(() => computeTraverse({ ...input(), closingEasting: 0 })).toThrow(/closing/i)
  })

  it('rejects nonfinite control and overflowed computed coordinates', () => {
    expect(() => computeTraverse({ ...input(), openingEasting: NaN })).toThrow()
    expect(() => computeTraverse({ ...input([shot({ slopeDist: '1e308' })]), openingNorthing: 1e308 })).toThrow()
  })

  it('retains every original string, row and metadata without rewriting the source', () => {
    const observations = [shot({ slopeDist: '0100.0000', remarks: 'Original field record' })]
    const before = JSON.stringify(observations)
    const result = computeTraverse(input(observations))
    expect(result.rawObservations).toEqual(observations)
    expect(JSON.stringify(observations)).toBe(before)
  })

  it('keeps the computation source snapshot separate from later caller edits', () => {
    const observations = [shot({ slopeDist: '0100.0000' })]
    const result = computeTraverse(input(observations))
    observations[0].slopeDist = '200'
    expect(result.rawObservations[0].slopeDist).toBe('0100.0000')
  })

  it('does not report zero misclosure or an accuracy class for an open traverse', () => {
    expect(computeTraverse(input())).toMatchObject({
      isClosed: false, linearError: null, precisionRatio: null, C_mm: null, allowable: null,
      accuracyOrder: 'NOT ASSESSED', assessment: { status: 'not_assessed' },
    })
  })

  it('reports closure without inventing an adopted standard or finite perfect-closure ratio', () => {
    expect(computeTraverse({ ...input(), closingEasting: 0, closingNorthing: 100 })).toMatchObject({
      isClosed: true, linearError: 0, precisionRatio: null, allowable: null,
      accuracyOrder: 'NOT ASSESSED', assessment: { status: 'not_assessed' },
    })
  })

  it.each([[100.002, 'pass'], [100.004, 'fail']] as const)('compares only to the supplied job limit for closing N=%s', (closingNorthing, status) => {
    const request = { ...input(), closingEasting: 0, closingNorthing, criterion: { allowableMisclosureMm: 3, reference: 'Synthetic job specification, section 4' } }
    const result = computeTraverse(request)
    expect(result).toMatchObject({ allowable: 3, assessment: { status, reference: request.criterion.reference } })
    expect(result.linearError).toBeCloseTo(Math.abs(closingNorthing - 100), 10)
    expect(result.coordinates[1].northing).toBeCloseTo(closingNorthing, 10)
  })

  it.each([{ allowableMisclosureMm: -1, reference: 'Job' }, { allowableMisclosureMm: 3, reference: '' }])('refuses an invalid stated criterion %j', criterion => {
    const request = { ...input(), closingEasting: 0, closingNorthing: 100, criterion }
    expect(() => computeTraverse(request)).toThrow(/criterion|limit|reference/i)
  })

  it('prints unknown evidence without a default datum, infinity or false pass', () => {
    const result = computeTraverse(input([shot({ ih: '' })]))
    const html = generateTraverseSheet({ result, meta: { title: 'Synthetic draft traverse' } })
    expect(html).toContain('NOT ASSESSED')
    expect(html).not.toMatch(/FIRST ORDER|&infin;|Arc 1960|Nairobi Datum|All heights are MSL|class="[^"]*pass/)
    expect(html).toContain('Unknown')
    expect(html).toContain('DRAFT')
    expect(html).not.toContain('I certify that this survey')
  })

  it('escapes observation names and criterion references in printable output', () => {
    const request = { ...input([shot({ station: '<img src=x onerror=alert(1)>' })]), closingEasting: 0, closingNorthing: 100, criterion: { allowableMisclosureMm: 3, reference: '<script>alert(1)</script>' } }
    const html = generateTraverseSheet({ result: computeTraverse(request), meta: { title: 'Draft' } })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;img')
  })

  it('carries rounded display seconds instead of printing an invalid DMS reading', () => {
    const result = computeTraverse(input([shot({ hclDeg: '359', hclMin: '59', hclSec: '59.99', hcrDeg: '179', hcrMin: '59', hcrSec: '59.99' })]))
    const html = generateTraverseSheet({ result, meta: { title: 'Synthetic display rounding' } })
    expect(html).not.toContain('59\u201960.0')
  })
})
