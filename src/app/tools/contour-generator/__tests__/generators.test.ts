/** @jest-environment node */

import { describe, expect, it } from '@jest/globals'
import type { ContourLine, SpotHeight } from '@/lib/engine/contours'
import type { Bounds } from '../types'
import { generateContourCSV, generateContourPDF, generateDXF, generateSVGExport } from '../generators'

const bounds: Bounds = { minE: 500000, maxE: 502000, minN: 9900000, maxN: 9901000, minZ: 100, maxZ: 120 }
const points: SpotHeight[] = [
  { name: 'P1', easting: 500000, northing: 9900000, elevation: 100 },
  { name: 'P2', easting: 502000, northing: 9900000, elevation: 110 },
  { name: 'P3', easting: 502000, northing: 9901000, elevation: 120 },
]
const contours: ContourLine[] = [{
  elevation: 110,
  isIndex: true,
  points: [
    { easting: 500000, northing: 9900000 },
    { easting: 501000, northing: 9900500 },
    { easting: 502000, northing: 9901000 },
  ],
}]
const metadata = {
  title: 'North Ridge & Drainage',
  horizontalCrs: 'EPSG:32737 / WGS 84 UTM zone 37S',
  verticalDatum: 'Local benchmark BM-01',
  contourInterval: 1,
  heightsInMetres: true,
}

describe('professional contour exports', () => {
  it('places a short index-line label at its arc midpoint rather than on an end observation', () => {
    const short = [{ ...contours[0], points: [contours[0].points[0], contours[0].points[2]] }]
    const svg = generateSVGExport(short, bounds, points, metadata)
    expect(svg).toMatch(/<text x="530" y="411"[^>]*>110 m<\/text>/)
  })
  it('does not merge distinct retained height labels by imposing 15 significant figures', () => {
    const precise = [{ ...contours[0], elevation: 110.0000000000001 }, { ...contours[0], elevation: 110.0000000000002 }]
    const svg = generateSVGExport(precise, bounds, points, { ...metadata, contourInterval: 1e-13 })
    expect(svg).toContain('110.0000000000001 m</text>')
    expect(svg).toContain('110.0000000000002 m</text>')
  })
  it('retains centimetre elevations on index labels, including short vertex lists', () => {
    const precise = [{ ...contours[0], elevation: 110.05 }]
    expect(generateSVGExport(precise, bounds, points, { ...metadata, contourInterval: 0.01 })).toContain('110.05 m</text>')
  })
  it('refuses non-finite contour coordinates instead of exporting a fabricated zero', () => {
    const invalid = [{ ...contours[0], points: [{ easting: Number.NaN, northing: 9900000 }, contours[0].points[1]] }]
    expect(() => generateDXF(invalid, bounds, metadata)).toThrow(/finite/i)
    expect(() => generateContourCSV(invalid, metadata)).toThrow(/finite/i)
    expect(() => generateSVGExport(invalid, bounds, points, metadata)).toThrow(/finite/i)
  })

  it('refuses unknown units and incomplete references rather than claiming metre exports', async () => {
    expect(() => generateDXF(contours, bounds, { ...metadata, horizontalCrs: '' })).toThrow(/CRS/i)
    expect(() => generateContourCSV(contours, { ...metadata, verticalDatum: '' })).toThrow(/datum/i)
    expect(() => generateContourCSV(contours, { ...metadata, heightsInMetres: false })).toThrow(/heights.*metres/i)
    expect(() => generateSVGExport(contours, bounds, points, { ...metadata, horizontalCrs: 'EPSG:4326' })).toThrow(/projected|metre/i)
    await expect(generateContourPDF(contours, bounds, points, { ...metadata, contourInterval: 0 })).rejects.toThrow(/interval/i)
  })

  it('refuses non-finite spots, reversed bounds and overflow before creating a drawing', async () => {
    const invalidPoints = [{ ...points[0], elevation: Infinity }, points[1], points[2]]
    expect(() => generateSVGExport(contours, bounds, invalidPoints, metadata)).toThrow(/finite/i)
    await expect(generateContourPDF(contours, bounds, invalidPoints, metadata)).rejects.toThrow(/finite/i)
    expect(() => generateDXF(contours, { ...bounds, minE: bounds.maxE + 1 }, metadata)).toThrow(/bounds/i)
    expect(() => generateSVGExport(contours, { ...bounds, minE: -1e308, maxE: 1e308 }, points, metadata)).toThrow(/bounds/i)
  })

  it('preserves sub-millimetre DXF coordinates and distinct close contour elevations', () => {
    const precise = [{ ...contours[0], elevation: 110.00001, points: [{ easting: 500000.000001, northing: 0 }, { easting: 501000, northing: 100 }] },
      { ...contours[0], elevation: 110.00002 }]
    const dxf = generateDXF(precise, { ...bounds, minN: 0, maxN: 9901000 }, { ...metadata, contourInterval: 0.00001 })
    expect(dxf).toContain('10\r\n500000.000001')
    expect(dxf).toContain('20\r\n0\r\n')
    expect(dxf).toContain('C110_00001')
    expect(dxf).toContain('C110_00002')
  })
  it('writes metre units, correct contour elevation, CRS notes, and a real layer count in DXF', () => {
    const dxf = generateDXF(contours, bounds, metadata)
    expect(dxf).toContain('$INSUNITS\r\n70\r\n6')
    expect(dxf).toContain('METARDU horizontal CRS: EPSG:32737 / WGS 84 UTM zone 37S')
    expect(dxf).toContain('38\r\n110\r\n')
    expect(dxf).toContain('100\r\nAcDbSymbolTable\r\n70\r\n1\r\n0\r\nLAYER')
    expect(dxf).toContain('370\r\n50')
    expect(dxf.endsWith('0\r\nEOF')).toBe(true)
  })

  it('keeps CSV reference text inert for spreadsheets', () => {
    expect(generateContourCSV(contours, { ...metadata, verticalDatum: '=1+1' })).toContain('"\'=1+1"')
  })

  it('creates a readable print-ready PDF and preserves source reference labels', async () => {
    const pdf = await generateContourPDF(contours, bounds, points, metadata)
    expect(pdf.type).toBe('application/pdf')
    const header = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()
    expect(header).toBe('%PDF-')
    expect(pdf.size).toBeGreaterThan(1500)
  })

  it('escapes title text and includes reference fields in SVG and CSV', () => {
    const svg = generateSVGExport(contours, bounds, points, metadata)
    const csv = generateContourCSV(contours, metadata)
    expect(svg).toContain('North Ridge &amp; Drainage')
    expect(svg).toContain('EPSG:32737 / WGS 84 UTM zone 37S')
    expect(svg).toContain('420mm')
    expect(csv.split('\n')[0]).toContain('horizontal_crs,vertical_datum')
    expect(csv).toContain('EPSG:32737 / WGS 84 UTM zone 37S')
    expect(csv).toContain('Local benchmark BM-01')
  })
})
