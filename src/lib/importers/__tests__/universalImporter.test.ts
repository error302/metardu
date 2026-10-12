import '@/lib/importers/index'
import { smartImport } from '../universalImporter'

function fileStub(name: string, content: string): File {
  return {
    name,
    size: new TextEncoder().encode(content).byteLength,
    lastModified: 0,
    text: async () => content,
  } as File
}

describe('smart survey import', () => {
  test('does not report a perfect traverse from DXF coordinate points without observations', async () => {
    const file = fileStub('control-points.dxf', `0\nSECTION\n2\nENTITIES\n0\nPOINT\n8\nCONTROL\n10\n500000\n20\n9900000\n0\nPOINT\n8\nCONTROL\n10\n500010\n20\n9900000\n0\nPOINT\n8\nCONTROL\n10\n500010\n20\n9900010\n0\nENDSEC\n0\nEOF\n`)

    const result = await smartImport(file)

    expect(result.success).toBe(false)
    expect(result.parserUsed).toBe('dxf')
    expect(result.totalEntries).toBe(3)
    expect(result.errors.join(' ')).toMatch(/finite bearing and positive distance/i)
    expect(result.errors.join(' ')).toMatch(/coordinate-only points/i)
    expect(result.adjustedLegs).toBeUndefined()
    expect(result.relativePrecision).toBeUndefined()
  })

  test('still adjusts a traverse when every source record has measured bearing and distance', async () => {
    const file = fileStub('site-traverse.csv', `station,easting,northing,bearing,distance\nA,0,0,90,10\nB,10,0,180,10\nC,10,-10,270,10\nD,0,-10,0,10`)

    const result = await smartImport(file)

    expect(result.success).toBe(true)
    expect(result.processed).toBe(true)
    expect(result.adjustedLegs).toHaveLength(4)
    expect(result.relativePrecision).toBeDefined()
  })
})
