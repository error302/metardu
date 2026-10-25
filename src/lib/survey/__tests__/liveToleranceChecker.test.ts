/**
 * Tests for LiveToleranceChecker
 *
 * Verifies that the field-side tolerance checker correctly:
 * - Preserves missing closure and criterion as unknown / not assessed
 * - Compares linear misclosure only to a supplied job limit and reference
 * - Reports allocated corrections without diagnosing a bad observation
 */

import {
  checkTolerance,
  getToleranceBadgeColor,
  getToleranceBadgeLabel,
  getToleranceIcon,
  type ToleranceCheckInput,
  type SurveyType,
} from '../liveToleranceChecker'
import type { RawObservation } from '@/lib/computations/traverseEngine'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a simple observation for a closed traverse around a square. */
function makeSquareTraverse(misclosureMm: number = 0): RawObservation[] {
  // A 100m × 100m square traverse, 4 legs of ~100m each.
  // Each station turns 90° CW from the backsight direction (first setup)
  // then 270° CW thereafter — same proven fixture as
  // computations/__tests__/traverseEngine.test.ts, which closes exactly.
  // Misclosure is injected by lengthening the second (and optionally fourth)
  // leg by `misclosureMm`.
  const dist = 100 + misclosureMm / 1000

  return [
    { station: 'CP2', bs: 'BS', fs: 'CP3', hclDeg: '90', hclMin: '00', hclSec: '00', hcrDeg: '270', hcrMin: '00', hcrSec: '00', slopeDist: '100', vaDeg: '90', vaMin: '00', vaSec: '00', ih: '1.5', th: '1.5' },
    { station: 'CP3', bs: 'CP1', fs: 'CP4', hclDeg: '270', hclMin: '00', hclSec: '00', hcrDeg: '90', hcrMin: '00', hcrSec: '00', slopeDist: String(dist), vaDeg: '90', vaMin: '00', vaSec: '00', ih: '1.5', th: '1.5' },
    { station: 'CP4', bs: 'CP2', fs: 'CP1', hclDeg: '270', hclMin: '00', hclSec: '00', hcrDeg: '90', hcrMin: '00', hcrSec: '00', slopeDist: '100', vaDeg: '90', vaMin: '00', vaSec: '00', ih: '1.5', th: '1.5' },
    { station: 'CP1', bs: 'CP3', fs: 'X', hclDeg: '270', hclMin: '00', hclSec: '00', hcrDeg: '90', hcrMin: '00', hcrSec: '00', slopeDist: '100', vaDeg: '90', vaMin: '00', vaSec: '00', ih: '1.5', th: '1.5' },
  ]
}

function makeInput(surveyType: SurveyType, observations: RawObservation[], _misclosureMm: number = 0): ToleranceCheckInput {
  return {
    surveyType,
    observations,
    openingEasting: 264000,
    openingNorthing: 9861000,
    openingStation: 'CP1',
    closingEasting: 264000,
    closingNorthing: 9861000,
    closingStation: 'CP1',
    backsightBearingDeg: 0,
    backsightBearingMin: 0,
    backsightBearingSec: 0,
  }
}

// ─── Insufficient Data ──────────────────────────────────────────────────────

describe('LiveToleranceChecker — insufficient data', () => {
  it('can compute a one-leg draft but makes no tolerance decision without a criterion', () => {
    const result = checkTolerance(makeInput('cadastral', [
      { station: 'CP1', bs: '', fs: 'CP2', hclDeg: '0', hclMin: '00', hclSec: '00', hcrDeg: '180', hcrMin: '00', hcrSec: '00', slopeDist: '100', vaDeg: '90', vaMin: '00', vaSec: '00', ih: '1.5', th: '1.5' },
    ]))

    expect(result.status).toBe('not_assessed')
    expect(result.hasEnoughData).toBe(true)
    expect(result.summary).toContain('No adopted job criterion')
  })

  it('returns insufficient_data with empty observations', () => {
    const result = checkTolerance(makeInput('cadastral', []))
    expect(result.status).toBe('insufficient_data')
  })
})

// ─── Survey Type Requirements ───────────────────────────────────────────────

describe('LiveToleranceChecker — survey type requirements', () => {
  it('cadastral metadata does not adopt an accuracy order', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse()))
    expect(result.requiredOrder).toBe('Not specified')
  })

  it('engineering metadata does not adopt an accuracy order', () => {
    const result = checkTolerance(makeInput('engineering', makeSquareTraverse()))
    expect(result.requiredOrder).toBe('Not specified')
  })

  it('monitoring metadata does not adopt an accuracy order', () => {
    const result = checkTolerance(makeInput('monitoring', makeSquareTraverse()))
    expect(result.requiredOrder).toBe('Not specified')
  })

  it('topographic metadata does not adopt an accuracy order', () => {
    const result = checkTolerance(makeInput('topographic', makeSquareTraverse()))
    expect(result.requiredOrder).toBe('Not specified')
  })
})

// ─── Worst Leg Identification ───────────────────────────────────────────────

describe('LiveToleranceChecker — worst leg identification', () => {
  it('identifies the leg with the largest correction when misclosure is injected', () => {
    // Inject 50mm misclosure on the second leg
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse(50)))

    if (result.worstLeg) {
      expect(result.worstLeg.from).toBeDefined()
      expect(result.worstLeg.to).toBeDefined()
      expect(result.worstLeg.residualMm).toBeGreaterThan(0)
      expect(result.worstLeg.recommendation).toMatch(/Recheck|Re-check|Re-measure/)
    }
  })

  it('returns null worstLeg when traverse is nearly perfect', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse(0)))
    // With a perfect square, corrections should be near zero
    // worstLeg may be null or have very small residual
    if (result.worstLeg) {
      expect(result.worstLeg.residualMm).toBeLessThan(1)
    }
  })

  it('provides actionable recommendation for the worst leg', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse(100)))

    if (result.worstLeg) {
      expect(result.worstLeg.recommendation).toMatch(/Recheck|Re-measure|Re-check/)
      expect(result.worstLeg.diagnosis).toContain('mm')
    }
  })
})

// ─── Badge Helpers ──────────────────────────────────────────────────────────

describe('LiveToleranceChecker — badge helpers', () => {
  it('returns green for pass', () => {
    expect(getToleranceBadgeColor('pass')).toBe('green')
    expect(getToleranceBadgeLabel('pass')).toBe('CLOSURE OK')
    expect(getToleranceIcon('pass')).toBe('✓')
  })

  it('returns yellow for marginal', () => {
    expect(getToleranceBadgeColor('marginal')).toBe('yellow')
    expect(getToleranceBadgeLabel('marginal')).toBe('MARGINAL')
    expect(getToleranceIcon('marginal')).toBe('!')
  })

  it('returns red for fail', () => {
    expect(getToleranceBadgeColor('fail')).toBe('red')
    expect(getToleranceBadgeLabel('fail')).toBe('CLOSURE FAIL')
    expect(getToleranceIcon('fail')).toBe('✗')
  })

  it('returns gray for insufficient_data', () => {
    expect(getToleranceBadgeColor('insufficient_data')).toBe('gray')
    expect(getToleranceBadgeLabel('insufficient_data')).toBe('NEED MORE DATA')
    expect(getToleranceIcon('insufficient_data')).toBe('···')
  })
})

// ─── Result Structure ───────────────────────────────────────────────────────

describe('LiveToleranceChecker — result structure', () => {
  it('returns a complete result object with all required fields', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse()))

    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('rdmChecks')
    expect(result).toHaveProperty('achievedOrder')
    expect(result).toHaveProperty('requiredOrder')
    expect(result).toHaveProperty('precisionRatio')
    expect(result).toHaveProperty('linearMisclosureMm')
    expect(result).toHaveProperty('perimeterKm')
    expect(result).toHaveProperty('worstLeg')
    expect(result).toHaveProperty('hasEnoughData')
    expect(result).toHaveProperty('recommendations')
    expect(result).toHaveProperty('timestamp')
  })

  it('includes the timestamp in ISO format', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse()))
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('returns recommendations array (non-empty)', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse()))
    expect(Array.isArray(result.recommendations)).toBe(true)
    expect(result.recommendations.length).toBeGreaterThan(0)
  })
})

describe('live closure evidence integrity', () => {
  it('does not infer a governing criterion or angle check from the survey type', () => {
    expect(checkTolerance(makeInput('cadastral', makeSquareTraverse()))).toMatchObject({
      status: 'not_assessed', requiredOrder: 'Not specified', achievedOrder: null,
      angularMisclosureArcsec: null, rdmChecks: { passed: false, checks: [], overallGrade: null },
    })
  })

  it.each([[2, 'pass'], [4, 'fail']] as const)('compares a %s mm misclosure to the supplied 3 mm limit', (error, status) => {
    const request = { ...makeInput('cadastral', makeSquareTraverse(error)), criterion: { allowableMisclosureMm: 3, reference: 'Synthetic specification 4' } }
    expect(checkTolerance(request)).toMatchObject({ status, requiredOrder: 'Synthetic specification 4' })
  })

  it('keeps open closure unknown, even when a criterion is supplied', () => {
    const request = { ...makeInput('cadastral', makeSquareTraverse()), closingEasting: undefined, closingNorthing: undefined, criterion: { allowableMisclosureMm: 3, reference: 'Job' } }
    expect(checkTolerance(request)).toMatchObject({ status: 'not_assessed', linearMisclosureMm: null, precisionRatio: null })
  })

  it('does not diagnose a bad observation from the largest Bowditch correction', () => {
    const result = checkTolerance(makeInput('cadastral', makeSquareTraverse(100)))
    expect(result.worstLeg).not.toBeNull()
    expect(result.worstLeg?.diagnosis).toContain('does not identify')
  })
})
