import { generateDXF } from '@/lib/export/generateDXF'
import { parseDxfGeometry } from '@/lib/importers/dxfGeometry'

const dxf = (records: Array<[number, string]>) => records.map(([code, value]) => `${code}\n${value}`).join('\n') + '\n'

describe('parseDxfGeometry', () => {
  it('reads points, lines, closed lightweight polylines and labels with units and source metadata', () => {
    const document = parseDxfGeometry(dxf([
      [0, 'SECTION'], [2, 'HEADER'], [9, '$INSUNITS'], [70, '4'], [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'POINT'], [5, 'A1'], [8, 'CONTROL'], [10, '500000'], [20, '9900000'], [30, '12.5'],
      [0, 'LINE'], [5, 'A2'], [8, 'ROAD'], [10, '1'], [20, '2'], [11, '3'], [21, '4'],
      [0, 'LWPOLYLINE'], [5, 'A3'], [8, 'BOUNDARY'], [90, '4'], [70, '1'],
      [10, '0'], [20, '0'], [10, '10'], [20, '0'], [10, '10'], [20, '10'], [10, '0'], [20, '10'],
      [0, 'TEXT'], [8, 'LABELS'], [10, '4'], [20, '5'], [1, 'Plot A'],
      [0, 'ENDSEC'], [0, 'EOF'],
    ]))

    expect(document.units).toMatchObject({ code: 4, label: 'millimetres', metresPerUnit: 0.001 })
    expect(document.entities).toHaveLength(4)
    expect(document.entities[0]).toMatchObject({ kind: 'point', layer: 'CONTROL', handle: 'A1', coordinates: [[500000, 9900000, 12.5]] })
    expect(document.entities[1]).toMatchObject({ kind: 'line', layer: 'ROAD', coordinates: [[1, 2], [3, 4]] })
    expect(document.entities[2]).toMatchObject({ kind: 'polyline', layer: 'BOUNDARY', closed: true, coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] })
    expect(document.entities[3]).toMatchObject({ kind: 'label', layer: 'LABELS', text: 'Plot A', coordinates: [[4, 5]] })
  })

  it('reads classic polylines, circles and arcs as editable linework', () => {
    const document = parseDxfGeometry(dxf([
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'POLYLINE'], [8, 'CLASSIC'], [70, '1'],
      [0, 'VERTEX'], [10, '0'], [20, '0'],
      [0, 'VERTEX'], [10, '10'], [20, '0'],
      [0, 'VERTEX'], [10, '10'], [20, '10'],
      [0, 'SEQEND'],
      [0, 'CIRCLE'], [8, 'CIRCLES'], [10, '20'], [20, '20'], [40, '5'],
      [0, 'ARC'], [8, 'ARCS'], [10, '0'], [20, '0'], [40, '2'], [50, '0'], [51, '90'],
      [0, 'ENDSEC'], [0, 'EOF'],
    ]))

    expect(document.entities[0]).toMatchObject({ kind: 'polyline', closed: true, layer: 'CLASSIC' })
    expect(document.entities[1].coordinates).toHaveLength(65)
    expect(document.entities[1].closed).toBe(true)
    expect(document.entities[2].coordinates).toHaveLength(19)
    expect(document.entities[2].closed).toBe(false)
  })

  it('requires explicit unit handling and warns instead of flattening bulged curves or unsupported entities', () => {
    const document = parseDxfGeometry(dxf([
      [0, 'SECTION'], [2, 'ENTITIES'],
      [0, 'LWPOLYLINE'], [90, '2'], [70, '0'], [10, '0'], [20, '0'], [42, '0.5'], [10, '1'], [20, '1'],
      [0, 'SPLINE'], [8, 'DETAIL'],
      [0, 'ENDSEC'], [0, 'EOF'],
    ]))

    expect(document.units).toMatchObject({ code: null, label: 'unspecified', metresPerUnit: null })
    expect(document.entities).toHaveLength(0)
    expect(document.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('bulged arc segments were skipped'),
      '1 SPLINE entity skipped; this importer preserves points, lines, polylines, circles, arcs, 3D faces, and text only.',
    ]))
  })

  it('parses METARDU-generated DXF output for re-import', () => {
    const generated = generateDXF({
      projectName: 'round-trip',
      points: [{ name: 'CP-01', easting: 500000, northing: 9900000, is_control: true }],
      mapEntities: [
        { kind: 'line', coordinates: [[500000, 9900000], [500010, 9900010]], label: 'pipe' },
        { kind: 'boundary', coordinates: [[500000, 9900000], [500020, 9900000], [500020, 9900020], [500000, 9900000]], label: 'parcel' },
      ],
    })

    const imported = parseDxfGeometry(generated)
    expect(imported.units).toMatchObject({ label: 'metres', metresPerUnit: 1 })
    expect(imported.entities.some((entity) => entity.kind === 'point' && entity.layer === 'CONTROL')).toBe(true)
    expect(imported.entities.some((entity) => entity.kind === 'polyline' && !entity.closed && entity.layer === 'MAP_LINE')).toBe(true)
    expect(imported.entities.some((entity) => entity.kind === 'polyline' && entity.closed && entity.layer === 'MAP_BOUNDARY')).toBe(true)
    expect(imported.entities.some((entity) => entity.kind === 'label' && entity.text?.includes('CP-01'))).toBe(true)
  })

  it('rejects malformed and binary DXF files', () => {
    expect(() => parseDxfGeometry('not a DXF')).toThrow(/malformed/)
    expect(() => parseDxfGeometry('0\nSECTION\n2\nENTITIES\n0\nEOF\n\0')).toThrow(/Binary DXF/)
  })
})
