import { validateCadastralBoundary } from '../topologyValidator'
import { expect } from '@jest/globals'


describe('validateCadastralBoundary with projected metre coordinates', () => {
  const square: [number, number][] = [
    [500_000, 9_000_000],
    [500_010, 9_000_000],
    [500_010, 9_000_020],
    [500_000, 9_000_020],
    [500_000, 9_000_000],
  ]

  it('computes planar area and perimeter in the declared coordinate units', () => {
    const result = validateCadastralBoundary(square)

    expect(result.isValid).toBe(true)
    expect(result.stats.areaSqM).toBeCloseTo(200, 8)
    expect(result.stats.perimeterM).toBeCloseTo(60, 8)
    expect(result.warnings.some((issue) => issue.rule === 'MIN_AREA')).toBe(false)
  })

  it('treats an operator-supplied area threshold as a review warning', () => {
    const result = validateCadastralBoundary(square, { minAreaSqM: 250 })

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'MIN_AREA',
        severity: 'warning',
        message: expect.stringContaining('configured 250 m² review threshold'),
      }),
    ]))
  })

  it('reports overlap area in square metres for projected geometry', () => {
    const result = validateCadastralBoundary(square, {
      adjoiners: [{
        id: 'adjacent-test',
        coordinates: [
          [500_005, 9_000_000],
          [500_015, 9_000_000],
          [500_015, 9_000_020],
          [500_005, 9_000_020],
        ],
      }],
    })

    const overlap = result.errors.find((issue) => issue.rule === 'ADJOINER_OVERLAP')
    expect(overlap?.message).toContain('100.00 m²')
  })
})
