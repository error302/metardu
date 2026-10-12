import { generateDXF } from '@/lib/export/generateDXF'
import { mapGeometryToDxfEntities, type MapDxfGeometryLike } from '@/lib/export/mapGeometryToDxf'
import { parseDxfGeometry } from '@/lib/importers/dxfGeometry'

function geometry(type: string, coordinates?: unknown, extra: Partial<MapDxfGeometryLike> = {}): MapDxfGeometryLike {
  return {
    getType: () => type,
    getCoordinates: () => coordinates,
    ...extra,
  }
}

describe('mapGeometryToDxfEntities', () => {
  const identity = ([x, y]: [number, number]): [number, number] => [x, y]

  it('leaves the existing survey-point and traverse export path intact', () => {
    const dxf = generateDXF({
      projectName: 'survey',
      points: [
        { name: 'CP-01', easting: 500000, northing: 9900000, is_control: true },
        { name: 'CP-02', easting: 500100, northing: 9900100, is_control: true },
      ],
      traverseLegs: [{ from: 'CP-01', to: 'CP-02', distance: 141.421, bearing: 45 }],
    })

    expect(dxf).toContain('CP-01')
    expect(dxf).toContain('CONTROL')
    expect(dxf).toContain('SPOT')
    expect(dxf).toContain('LINE')
  })

  it('preserves mixed point, line, polygon rings, and labels as distinct entities', () => {
    const entities = mapGeometryToDxfEntities([
      { geometry: geometry('Point', [10, 20]), label: 'MH-01' },
      { geometry: geometry('LineString', [[0, 0], [10, 10]]), label: 'Pipe run' },
      { geometry: geometry('Polygon', [
        [[0, 0], [10, 0], [10, 10], [0, 0]],
        [[2, 2], [3, 2], [2, 3], [2, 2]],
      ]), label: 'Parcel' },
    ], identity)

    expect(entities).toEqual([
      { kind: 'point', coordinates: [10, 20], label: 'MH-01' },
      { kind: 'line', coordinates: [[0, 0], [10, 10]], label: 'Pipe run' },
      { kind: 'boundary', coordinates: [[0, 0], [10, 0], [10, 10], [0, 0]], label: 'Parcel' },
      { kind: 'boundary', coordinates: [[2, 2], [3, 2], [2, 3], [2, 2]], label: 'Parcel-ring-2' },
    ])

    const dxf = generateDXF({ projectName: 'map', points: [], mapEntities: entities })
    expect(dxf).toContain('MAP_POINT')
    expect(dxf).toContain('MAP_LINE')
    expect(dxf).toContain('MAP_BOUNDARY')
    expect(dxf.match(/LWPOLYLINE/g)).toHaveLength(3)
    expect(dxf.match(/\nPOINT\n/g)).toHaveLength(1)
    expect(dxf).toContain('MH-01')
    expect(dxf).toContain('Pipe run')
  })

  it('transforms all vertices and supports multi-geometries and circles', () => {
    const entities = mapGeometryToDxfEntities([
      { geometry: geometry('MultiLineString', [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]) },
      { geometry: geometry('Circle', undefined, {
        getCenter: () => [10, 20],
        getRadius: () => 5,
      }) },
    ], ([x, y]) => [x + 100, y - 50])

    expect(entities).toHaveLength(3)
    expect(entities[0]).toMatchObject({ kind: 'line', coordinates: [[101, -48], [103, -46]] })
    expect(entities[1]).toMatchObject({ kind: 'line', coordinates: [[105, -44], [107, -42]] })
    expect(entities[2].kind).toBe('boundary')
    if (entities[2].kind === 'boundary') {
      expect(entities[2].coordinates).toHaveLength(65)
      expect(entities[2].coordinates[0]).toEqual(entities[2].coordinates[64])
    }
  })

  it('preserves imported DXF layers and closed polylines on export', () => {
    const entities = mapGeometryToDxfEntities([
      { geometry: geometry('LineString', [[0, 0], [10, 0], [10, 10]]), label: 'boundary', dxfLayer: 'PARCEL A', dxfClosed: true },
      { geometry: geometry('Point', [4, 5]), label: 'Lot 8', dxfLayer: 'CAD_TEXT', dxfEntityType: 'label' },
    ], identity)

    expect(entities).toEqual([
      { kind: 'boundary', coordinates: [[0, 0], [10, 0], [10, 10], [0, 0]], label: 'boundary', sourceLayer: 'PARCEL A' },
      { kind: 'label', coordinates: [4, 5], text: 'Lot 8', sourceLayer: 'CAD_TEXT' },
    ])
    const output = generateDXF({ projectName: 'layers', points: [], mapEntities: entities })
    const imported = parseDxfGeometry(output)
    expect(imported.entities.some((entity) => entity.kind === 'polyline' && entity.closed && entity.layer === 'PARCEL A')).toBe(true)
    expect(imported.entities.some((entity) => entity.kind === 'label' && entity.layer === 'CAD_TEXT' && entity.text === 'Lot 8')).toBe(true)
    expect(imported.entities.some((entity) => entity.kind === 'point' && entity.layer === 'CAD_TEXT')).toBe(false)
  })

  it('fails the export instead of silently dropping invalid or unsupported geometry', () => {
    expect(() => mapGeometryToDxfEntities([
      { geometry: geometry('Point', [Number.NaN, 1]) },
    ], identity)).toThrow(/invalid coordinate/)

    expect(() => mapGeometryToDxfEntities([
      { geometry: geometry('UnsupportedSurface', []) },
    ], identity)).toThrow(/does not support UnsupportedSurface/)

    expect(() => mapGeometryToDxfEntities([
      { geometry: geometry('LineString', [[0, 0], [1, 1]]) },
    ], () => [Number.POSITIVE_INFINITY, 0])).toThrow(/could not be transformed/)
  })
})
