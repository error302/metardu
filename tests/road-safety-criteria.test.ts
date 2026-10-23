import { sightDistanceCheck, superelevationDesign, checkRadiusCompliance } from '@/lib/computations/roadDesignEngine'

const sight = { designSpeed: 80, gradient: 0, roadClass: 'DR4', terrain: 'rolling', proposedSSD: 100,
  criteria: { reference: 'Synthetic design criteria rev 1', longitudinalFriction: 0.35, reactionTimeSeconds: 2.5, minimumStoppingDistanceM: 140 } }
const banking = { designSpeed: 80, radius: 300, roadClass: 'DR4', numLanes: 1, laneWidth: 3.5, initialCrossfall: -0.025, providedSuperelevation: 0.06,
  criteria: { reference: 'Synthetic design criteria rev 1', lateralFriction: 0.14, maximumSuperelevation: 0.08, maximumRelativeGradient: 0.005 } }

test('compares available sight distance to the model and the declared minimum', () => {
  const result = sightDistanceCheck(sight)
  // Independent 40-digit Decimal evaluation: 6400/(254*0.35) + 80*2.5/3.6.
  expect(result.ssdComputed).toBeCloseTo(127.54655668041495, 8)
  expect(result).toHaveProperty('requiredSSD', 140)
  expect(result.isSSDCompliant).toBe(false)
  expect(result).toHaveProperty('ssdStatus', 'FAIL')
})

test('missing available sight distance cannot imply approval', () => {
  const result = sightDistanceCheck({ ...sight, proposedSSD: undefined })
  expect(result.isSSDCompliant).toBeNull()
  expect(result).toHaveProperty('ssdStatus', 'UNASSESSED')
  expect(result.isPSDCompliant).toBeNull()
  expect(result.psdMin).toBeNull()
})

test('a supplied available distance of zero is retained and fails', () => {
  expect(sightDistanceCheck({ ...sight, proposedSSD: 0 }).isSSDCompliant).toBe(false)
})

test('grade correction retains its sign and downhill increases stopping demand', () => {
  const uphill = sightDistanceCheck({ ...sight, gradient: 6 })
  const downhill = sightDistanceCheck({ ...sight, gradient: -6 })
  expect(uphill.ssdGradeCorrection).toBeLessThan(0)
  expect(downhill.ssdGradeCorrection).toBeGreaterThan(0)
  expect(downhill.ssdComputed).toBeGreaterThan(uphill.ssdComputed)
})

test('missing explicit stopping criteria cannot use a hardcoded speed/terrain table', () => {
  expect(() => sightDistanceCheck({ ...sight, criteria: undefined })).toThrow(/criteria/i)
})

test('nonpositive braking denominator is refused', () => {
  expect(() => sightDistanceCheck({ ...sight, gradient: -35 })).toThrow()
})

test('superelevation uses lateral friction and retains the supplied banking rather than capping it', () => {
  const result = superelevationDesign({ ...banking, providedSuperelevation: 0.1 })
  expect(result.requiredE).toBeCloseTo(0.0279790026246719, 10)
  expect(result.designE).toBe(0.1)
  expect(result).toHaveProperty('checks.withinSuperelevationLimit', false)
})

test('crossfall rotation length is dimensionally based on rotated width and relative gradient', () => {
  const result = superelevationDesign(banking)
  expect(result.transitionLength).toBeCloseTo(59.5, 10)
  expect(result).toHaveProperty('checks.lateralDemandMet', true)
})

test('missing explicit lateral criteria cannot imply compliant design', () => {
  expect(() => superelevationDesign({ ...banking, criteria: undefined })).toThrow(/criteria/i)
})

test('missing radius criteria cannot produce a zero minimum and green status', () => {
  expect(() => Reflect.apply(checkRadiusCompliance, undefined, [300])).toThrow(/criteria/i)
})

test.each([{ designSpeed: NaN }, { radius: 0 }, { numLanes: 1.5 }, { laneWidth: -1 }])('rejects invalid superelevation input %j', change => {
  expect(() => superelevationDesign({ ...banking, ...change })).toThrow()
})

test.each([{ designSpeed: Infinity }, { gradient: NaN }, { proposedSSD: -1 }])('rejects invalid sight-distance input %j', change => {
  expect(() => sightDistanceCheck({ ...sight, ...change })).toThrow()
})

test('PSD is assessed only against its own declared minimum and available distance', () => {
  const result = sightDistanceCheck({ ...sight, proposedSSD: 150, proposedPSD: 200, criteria: { ...sight.criteria, minimumPassingDistanceM: 450 } })
  expect(result.isSSDCompliant).toBe(true)
  expect(result.isPSDCompliant).toBe(false)
  expect(result.psdStatus).toBe('FAIL')
})

test('a declared minimum cannot reduce model stopping demand', () => {
  const result = sightDistanceCheck({ ...sight, gradient: -6, proposedSSD: 140, criteria: { ...sight.criteria, minimumStoppingDistanceM: 100 } })
  expect(result.requiredSSD).toBe(result.ssdComputed)
  expect(result.requiredSSD).toBeGreaterThan(140)
  expect(result.isSSDCompliant).toBe(false)
})

test('arbitrary supported positive speed uses explicit criteria without nearest-speed guesses', () => {
  const result = sightDistanceCheck({ ...sight, designSpeed: 85.5 })
  expect(result.frictionFactor).toBe(0.35)
  expect(result.criteriaReference).toBe(sight.criteria.reference)
  expect(result.standardCompliance).toBe('NOT_ASSESSED')
})

test('criteria are copied so later caller edits cannot rewrite result provenance', () => {
  const criteria = { ...sight.criteria }
  const result = sightDistanceCheck({ ...sight, criteria })
  criteria.reference = 'Other revision'
  criteria.longitudinalFriction = 0.1
  expect(result.criteria.reference).toBe(sight.criteria.reference)
  expect(result.criteria.longitudinalFriction).toBe(0.35)
})

test.each([
  { reference: '' }, { longitudinalFriction: 0 }, { longitudinalFriction: NaN }, { reactionTimeSeconds: 0 },
  { minimumStoppingDistanceM: -1 }, { minimumPassingDistanceM: Infinity },
])('refuses malformed braking criteria %j', change => {
  expect(() => sightDistanceCheck({ ...sight, criteria: { ...sight.criteria, ...change } })).toThrow()
})

test.each([
  { lateralFriction: -1 }, { maximumSuperelevation: 0 }, { maximumRelativeGradient: 0 },
  { reference: '' }, { maximumRelativeGradient: Infinity },
])('refuses malformed banking criteria %j', change => {
  expect(() => superelevationDesign({ ...banking, criteria: { ...banking.criteria, ...change } })).toThrow()
})

test('banking below declared lateral demand fails even when below the maximum', () => {
  const result = superelevationDesign({ ...banking, providedSuperelevation: 0 })
  expect(result.checks.withinSuperelevationLimit).toBe(true)
  expect(result.checks.lateralDemandMet).toBe(false)
  expect(result.status).toBe('FAIL')
})

test('zero crossfall change has zero rotation length, without inventing runoff', () => {
  const result = superelevationDesign({ ...banking, initialCrossfall: 0.06 })
  expect(result.transitionLength).toBe(0)
})

test('declared minimum radius comparison never certifies visibility', () => {
  const result = checkRadiusCompliance(300, { reference: 'Synthetic radius criteria rev 2', minimumRadiusM: 400 })
  expect(result.ratio).toBe(0.75)
  expect(result.meetsMinimum).toBe(false)
  expect(result.status).toBe('FAIL')
  expect(result.standardCompliance).toBe('NOT_ASSESSED')
})

test('unrepresentable numerical outputs cannot escape as JSON nulls', () => {
  expect(() => sightDistanceCheck({ ...sight, designSpeed: Number.MAX_VALUE })).toThrow(/range/i)
  expect(() => superelevationDesign({ ...banking, designSpeed: Number.MAX_VALUE })).toThrow(/range/i)
  expect(() => checkRadiusCompliance(Number.MAX_VALUE, { reference: 'Synthetic', minimumRadiusM: Number.MIN_VALUE })).toThrow(/range/i)
})

test('overflow in a positive braking denominator cannot silently publish zero braking distance', () => {
  expect(() => sightDistanceCheck({ ...sight, gradient: Number.MAX_VALUE })).toThrow(/range/i)
})

test('positive but unrepresentable lateral demand cannot become a zero-demand approval', () => {
  expect(() => superelevationDesign({ ...banking, designSpeed: Number.MIN_VALUE })).toThrow(/range/i)
})
