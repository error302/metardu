import { simpleCircularCurve } from '../curves'
import { computeHorizontalCurve } from '../../engine/engineering'
import { horizontalCurveElements } from '../../computations/roadDesignEngine'

describe('horizontal scalar and legacy set-out integrity', () => {
  it('includes exact PC/PT and uses actual consecutive peg chords', () => {
    const result = simpleCircularCurve({ radius: 100, deflectionAngle: 60, chainage_IP: 500 })
    const pc = 500 - 100 / Math.sqrt(3), pt = pc + 100 * Math.PI / 3
    expect(result.chainage_TC).toBeCloseTo(pc, 11)
    expect(result.chainage_CT).toBeCloseTo(pt, 11)
    expect(result.settingOutTable[0]).toEqual({ chainage: result.chainage_TC, deflectionFromTC: 0, chordFromTC: 0, chordIncrement: 0 })
    expect(result.settingOutTable.at(-1)?.chainage).toBe(result.chainage_CT)
    expect(result.settingOutTable.find(row => row.chainage === 480)?.chordIncrement).toBeCloseTo(19.96668332936563, 11)
    expect(result.settingOutTable.at(-1)?.deflectionFromTC).toBeCloseTo(30, 12)
  })

  it.each([[0, 60, 500], [-1, 60, 500], [100, 0, 500], [100, -1, 500], [100, 200, 500], [NaN, 60, 500]])(
    'refuses invalid scalar geometry R=%s angle=%s PI=%s', (radius, delta, station) => {
      expect(() => computeHorizontalCurve(radius, delta, station)).toThrow()
      expect(() => simpleCircularCurve({ radius, deflectionAngle: delta, chainage_IP: station })).toThrow()
    })

  it('refuses collapsed scalar stations even when inputs are finite', () => {
    expect(() => computeHorizontalCurve(100, 60, 1e30)).toThrow()
  })

  it('rejects inadequate chainage resolution before a schedule can disagree with its elements', () => {
    expect(() => horizontalCurveElements({ radius: 100, deflectionAngleDeg: 60, deflectionAngleMin: 0,
      deflectionAngleSec: 0, ipChainage: 1e12 })).toThrow(/precision/i)
  })

  it('retains a nonzero mid-ordinate for a small but representable angle', () => {
    const result = computeHorizontalCurve(10000, 1e-7, 0)
    expect(result.midOrdinate).toBeGreaterThan(0)
    expect(result.externalDistance).toBeGreaterThan(0)
    expect(result.midOrdinate).toBeCloseTo(10000 * 2 * Math.sin(1e-7 * Math.PI / 720) ** 2, 25)
  })

  it('does not overflow intermediates when all final elements are representable', () => {
    const result = horizontalCurveElements({ radius: 1e308, deflectionAngleDeg: 1, deflectionAngleMin: 0,
      deflectionAngleSec: 0, ipChainage: 0 })
    expect(result.curveLength / 1e308).toBeCloseTo(Math.PI / 180, 14)
    expect(result.longChord / 1e308).toBeCloseTo(2 * Math.sin(Math.PI / 360), 14)
  })

  // Formerly unbounded sampling cases are checked only after the old loop is removed.
  it.each([0, -1, Infinity, NaN, Number.MIN_VALUE, 0.00001])('bounds unsafe peg interval %s', interval => {
    expect(() => simpleCircularCurve({ radius: 100, deflectionAngle: 60, chainage_IP: 500, interval })).toThrow()
  })

  it.each([1e30, 1e12])('refuses inadequate schedule station precision at %s', chainage_IP => {
    expect(() => simpleCircularCurve({ radius: 100, deflectionAngle: 60, chainage_IP })).toThrow()
  })

  it('allows a deliberate coarse interval and retains full-precision endpoint data', () => {
    const result = simpleCircularCurve({ radius: 100, deflectionAngle: 60, chainage_IP: -100, interval: 1000 })
    expect(result.settingOutTable).toHaveLength(2)
    expect(result.settingOutTable.at(-1)?.chordIncrement).toBeCloseTo(100, 12)
    expect(result.standardCompliance).toBe('NOT_ASSESSED')
    expect(result.coordinateReferenceStatus).toBe('NOT_VERIFIED')
  })
})
