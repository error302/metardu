import View from 'ol/View'
import { fromLonLat } from 'ol/proj'
import { buildOsmContextRequest } from '../osmContextRequest'

describe('buildOsmContextRequest', () => {
  it('transforms the map center to WGS 84 and derives a radius from viewport scale', async () => {
    const view = new View({
      projection: 'EPSG:3857',
      center: fromLonLat([36.8, -1.3]),
      resolution: 1,
    })

    const request = await buildOsmContextRequest(view, [1000, 600])

    expect(request.lon).toBeCloseTo(36.8, 4)
    expect(request.lat).toBeCloseTo(-1.3, 4)
    expect(request.radius).toBeGreaterThan(500)
    expect(request.radius).toBeLessThan(600)
    expect(request.coverageLimited).toBe(false)
  })

  it('caps large viewports and reports that context coverage is partial', async () => {
    const view = new View({
      projection: 'EPSG:3857',
      center: [0, 0],
      resolution: 10,
    })

    const request = await buildOsmContextRequest(view, [1000, 600])

    expect(request.radius).toBe(2000)
    expect(request.coverageLimited).toBe(true)
  })

  it('rejects a viewport that has not been laid out yet', async () => {
    const view = new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 1 })

    await expect(buildOsmContextRequest(view, undefined)).rejects.toThrow('viewport is not ready')
  })
})
