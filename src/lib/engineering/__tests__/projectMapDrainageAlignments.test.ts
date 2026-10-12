import { extractProjectMapDrainageAlignments } from '../projectMapDrainageAlignments'
import { orientDrainageMapAlignment } from '../drainageAlignment'
import { SRID_21037 } from '@/lib/map/projectionConstants'

describe('project map drainage alignments', () => {
  it('transforms saved WGS84 LineStrings into the declared projected project CRS', () => {
    const result = extractProjectMapDrainageAlignments({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'pipe-route-1',
        properties: { name: 'Storm line A' },
        geometry: { type: 'LineString', coordinates: [[36.8, -1.3], [36.801, -1.3]] },
      }],
    }, SRID_21037)

    expect(result.alignments).toHaveLength(1)
    expect(result.alignments[0]).toMatchObject({
      label: 'Storm line A',
      sourceCrs: 'EPSG:4326',
      projectCrs: SRID_21037,
    })
    expect(result.alignments[0].featureKey.startsWith('map-line:pipe-route-1:')).toBe(true)
    expect(result.alignments[0].vertices).toHaveLength(2)
    expect(result.alignments[0].vertices.every(vertex => Number.isFinite(vertex.easting) && Number.isFinite(vertex.northing))).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('ignores non-lines and reports malformed, closed, or out-of-range lines', () => {
    const result = extractProjectMapDrainageAlignments({
      features: [
        { geometry: { type: 'Polygon', coordinates: [] } },
        { geometry: { type: 'LineString', coordinates: [[36.8, -1.3]] } },
        { geometry: { type: 'LineString', coordinates: [[36.8, -1.3], [181, -1.3]] } },
        { geometry: { type: 'LineString', coordinates: [[36.8, -1.3], [36.801, -1.3], [36.8, -1.3]] } },
      ],
    }, SRID_21037)

    expect(result.alignments).toHaveLength(0)
    expect(result.warnings.join(' ')).toMatch(/fewer than two vertices/)
    expect(result.warnings.join(' ')).toMatch(/valid WGS84/)
    expect(result.warnings.join(' ')).toMatch(/closed lines/)
    expect(result.warnings.join(' ')).toMatch(/3 saved map line/)
  })

  it('rejects display-only or geographic project coordinate systems', () => {
    expect(() => extractProjectMapDrainageAlignments({ features: [] }, 'EPSG:3857')).toThrow()
    expect(() => extractProjectMapDrainageAlignments({ features: [] }, 'EPSG:4326')).toThrow()
  })

  it('reverses a digitized line when the opposite direction better matches manhole order', () => {
    const aligned = orientDrainageMapAlignment(
      [{ easting: 110, northing: 0 }, { easting: 105, northing: 0 }, { easting: 100, northing: 0 }],
      { easting: 100, northing: 0 },
      { easting: 110, northing: 0 },
    )

    expect(aligned.orientation).toBe('reversed')
    expect(aligned.vertices).toEqual([{ easting: 105, northing: 0 }])
    expect(aligned.startConnectorM).toBe(0)
    expect(aligned.endConnectorM).toBe(0)
  })

  it('preserves endpoint connector distances and excludes only coincident endpoint vertices', () => {
    const aligned = orientDrainageMapAlignment(
      [{ easting: 2, northing: 0 }, { easting: 5, northing: 0 }, { easting: 9, northing: 0 }],
      { easting: 0, northing: 0 },
      { easting: 10, northing: 0 },
    )

    expect(aligned.vertices).toEqual([
      { easting: 2, northing: 0 },
      { easting: 5, northing: 0 },
      { easting: 9, northing: 0 },
    ])
    expect(aligned.startConnectorM).toBe(2)
    expect(aligned.endConnectorM).toBe(1)
  })
})
