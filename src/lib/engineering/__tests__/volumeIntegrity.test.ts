import { crossSectionVolume, massHaulDiagram } from '../compute'
import { calculateVolumes } from '../volume'

describe('cross-section volume numerical integrity', () => {
  it('uses actual station spans for grouped volumes and interpolates balance crossings', () => {
    const input = { cumulativeVolumes: [0, 400, -800], stationInterval: 20, stations: [0, 40, 60] }
    const result = massHaulDiagram(input)
    expect(result.diagram.map(row => row.station)).toEqual([0, 40, 60])
    expect(result.balancePoint).toBe(50)
    expect(result.haulDistance).toBe(12000)
  })
  it('integrates a constant 10 m² area over two 20 m intervals as 400 m³', () => {
    const result = crossSectionVolume({ areas: [10, 10, 10], stationInterval: 20, method: 'prismoidal' })
    expect(result.totalCut).toBe(400)
    expect(result.totalFill).toBe(0)
    expect(result.volumeTable.map(row => row.cutVolume)).toEqual([0, 0, 400])
  })

  it('integrates a quadratic area using the actual middle section', () => {
    const result = crossSectionVolume({ areas: [0, 1, 4], stationInterval: 1, method: 'prismoidal' })
    expect(result.totalCut).toBeCloseTo(8 / 3, 2)
  })

  it('uses end-area once for the unpaired last interval', () => {
    const result = crossSectionVolume({ areas: [10, 10, 10, 10], stationInterval: 20, method: 'prismoidal' })
    expect(result.totalCut).toBe(600)
    expect(result.volumeTable.map(row => row.cutVolume)).toEqual([0, 0, 400, 200])
  })

  it.each(['end-area', 'prismoidal'] as const)('does not cancel excavation and fill at a sign change (%s)', method => {
    const result = crossSectionVolume({ areas: [10, -10], stationInterval: 20, method })
    expect(result.totalCut).toBe(50)
    expect(result.totalFill).toBe(50)
    expect(result.netVolume).toBe(0)
    expect(result.isBalanced).toBe(true)
  })

  it('splits an unequal linear area transition at the interpolated zero', () => {
    const result = crossSectionVolume({ areas: [12, -4], stationInterval: 20, method: 'end-area' })
    expect(result.totalCut).toBe(90)
    expect(result.totalFill).toBe(10)
  })

  it('falls back to separate end-area intervals when a Simpson group contains cut and fill', () => {
    const result = crossSectionVolume({ areas: [10, -10, 10], stationInterval: 20, method: 'prismoidal' })
    expect(result.totalCut).toBe(100)
    expect(result.totalFill).toBe(100)
  })

  it('does not invent a balance tolerance: the flag means a numerical zero net volume', () => {
    const result = crossSectionVolume({ areas: [100, -96], stationInterval: 20, method: 'end-area' })
    expect(result.isBalanced).toBe(false)
  })

  it.each([Infinity, -Infinity, NaN])('rejects non-finite area %p', area => {
    expect(() => crossSectionVolume({ areas: [10, area], stationInterval: 20, method: 'end-area' })).toThrow()
  })

  it('keeps the legacy volume entry point consistent with the shared engine', () => {
    const input = { areas: [10, 10, 10, -10], stationInterval: 20, method: 'prismoidal' as const }
    const result = crossSectionVolume(input)
    const legacy = calculateVolumes(input)
    expect(legacy.totalCutVolume).toBe(result.totalCut)
    expect(legacy.totalFillVolume).toBe(result.totalFill)
    expect(legacy.netVolume).toBe(result.netVolume)
    expect(legacy.volumesByStation).toEqual(result.volumeTable.slice(1).map(row => row.cutVolume - row.fillVolume))
  })
})
