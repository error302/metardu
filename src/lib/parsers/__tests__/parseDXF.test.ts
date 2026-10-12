import { parseDXFFileContent } from '../parseDXF'
import { summarizeParsedInput } from '../uploadSummary'

function dxf(entities: string, units = '6'): string {
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
}

describe('DXF survey geometry import', () => {
  test('retains every closed lightweight-polyline vertex, its layer and drawing bounds', async () => {
    const content = dxf(`0\nLWPOLYLINE\n8\nPARCEL\n70\n1\n90\n4\n10\n500000\n20\n9900000\n10\n500010\n20\n9900000\n10\n500010\n20\n9900010\n10\n500000\n20\n9900010\n`)

    const result = await parseDXFFileContent(content, 'boundary.dxf')
    const polyline = result.cad?.entities[0]

    expect(result.errors).toEqual([])
    expect(result.building).toBeUndefined()
    expect(polyline).toMatchObject({ kind: 'LWPOLYLINE', layer: 'PARCEL', closed: true })
    expect(polyline?.coordinates).toHaveLength(4)
    expect(result.cad?.boundingBox).toEqual({
      minEasting: 500000,
      maxEasting: 500010,
      minNorthing: 9900000,
      maxNorthing: 9900010,
    })
    expect(result.cad?.units).toBe('meters')
    expect(result.cad?.coordinateReferenceSystem).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/not ready for map overlay or set-out/i)

    expect(summarizeParsedInput(result)).toMatchObject({
      hasCad: true,
      hasBuilding: false,
      cad: { entities: 1, polylines: 1, layers: 1, units: 'meters', coordinateReferenceSystem: null },
    })
  })

  test('joins legacy POLYLINE vertices from VERTEX records without inventing a room', async () => {
    const content = dxf(`0\nPOLYLINE\n8\nCONTROL\n70\n0\n0\nVERTEX\n10\n12.5\n20\n8.25\n30\n100.2\n0\nVERTEX\n10\n22.5\n20\n18.25\n30\n100.8\n0\nSEQEND\n`)

    const result = await parseDXFFileContent(content, 'control-line.dxf')

    expect(result.cad?.entities[0]).toMatchObject({
      kind: 'POLYLINE',
      closed: false,
      coordinates: [
        { easting: 12.5, northing: 8.25, elevation: 100.2 },
        { easting: 22.5, northing: 18.25, elevation: 100.8 },
      ],
    })
    expect(result.building).toBeUndefined()
    expect(result.warnings.join(' ')).not.toMatch(/no SEQEND/i)
  })

  test('does not assume units or silently accept a file without an ENTITIES section', async () => {
    const noUnits = await parseDXFFileContent(dxf(`0\nPOINT\n10\n1\n20\n2\n`, '0'), 'local.dxf')
    const missingEntities = await parseDXFFileContent('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n', 'empty.dxf')

    expect(noUnits.cad?.units).toBe('unitless')
    expect(noUnits.warnings.join(' ')).toMatch(/declares unitless coordinates/i)
    expect(missingEntities.errors.join(' ')).toMatch(/no DXF ENTITIES section/i)
    expect(missingEntities.cad).toBeUndefined()
  })
})
