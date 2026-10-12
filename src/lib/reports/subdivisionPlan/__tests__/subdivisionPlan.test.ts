import { renderSubdivisionPlan } from '../subdivisionPlanRenderer'
import type { SubdivisionPlanData } from '../types'

function draft(): SubdivisionPlanData {
  return {
    projectCrs: 'EPSG:21037',
    countyName: 'Example County',
    parcelNumber: 'TEST/001',
    ward: '',
    location: '',
    userCategory: '',
    portions: [{
      id: 'portion-a',
      label: 'A',
      areaHa: 88,
      boundaryPoints: [
        { easting: 100, northing: 0 },
        { easting: 200, northing: 0 },
        { easting: 200, northing: 100 },
        { easting: 100, northing: 100 },
      ],
    }],
    roadReserves: [{
      label: 'Generated access reserve',
      widthM: 9,
      boundaryRings: [[
        { easting: 91, northing: 0 },
        { easting: 100, northing: 0 },
        { easting: 100, northing: 100 },
        { easting: 91, northing: 100 },
      ]],
    }],
    truncations: [],
    abuttals: [],
    locationPlan: { landmarkName: '', nearbyParcels: [], accessRoadLabel: '' },
    owner: { name: '', address: '', idNo: '' },
    planner: { name: '', address: '', rppNo: '' },
    surveyor: { name: '', address: '', lsNo: '' },
    notes: [],
  }
}

describe('subdivision plan draft renderer', () => {
  it('prints explicit parcel and road geometry with coordinate-derived area and a fit scale', () => {
    const svg = renderSubdivisionPlan(draft())

    expect(svg).toContain('viewBox="0 0 420 297"')
    expect(svg).toContain('width="420mm" height="297mm"')
    expect(svg).toContain('DRAFT — NOT AUTHORITY APPROVED')
    expect(svg).toContain('Status: NOT SUBMITTED / NOT APPROVED')
    expect(svg).toContain('CRS: EPSG:21037')
    expect(svg).toContain('A = 1.0000')
    expect(svg).toContain('corridor geometry plotted')
    expect(svg).toContain('GRID CRS: EPSG:21037 · GRID NORTH')
    expect(svg).toContain('E 100')
    expect(svg).toMatch(/FIT SCALE: 1:\d+/)
    expect(svg).toContain('A3 landscape · print at 100% to retain scale')
    expect(svg.match(/<!-- Portion A Polygon -->/g)).toHaveLength(1)
    expect(svg.match(/aria-label="Generated access reserve road reserve"/g)).toHaveLength(1)
    expect(svg).not.toContain('SCALE: 1:1,000')
  })

  it('does not plot an unlocated road width or invent a truncation', () => {
    const data = draft()
    data.roadReserves = [{ label: 'Access road', widthM: 9 }]
    data.truncations = [{ atJunction: 'Junction A', widthM: 9, truncationM: 4.5 }]
    const svg = renderSubdivisionPlan(data)

    expect(svg.match(/<!-- Portion A Polygon -->/g)).toHaveLength(1)
    expect(svg).not.toContain('road reserve" />')
    expect(svg).toContain('alignment not supplied')
    expect(svg).toContain('location not supplied')
    expect(svg).not.toContain('4.5m Truncation')
  })

  it('fails closed when the CRS is missing or display-only', () => {
    const data = draft()
    data.projectCrs = undefined
    const missing = renderSubdivisionPlan(data)
    expect(missing).toContain('BOUNDARY NOT PLOTTED')
    expect(missing).toContain('FIT SCALE: NOT PLOTTED')
    expect(missing).not.toContain('GRID CRS:')
    expect(missing).not.toContain('<!-- Portion A Polygon -->')

    data.projectCrs = 'EPSG:3857'
    const displayOnly = renderSubdivisionPlan(data)
    expect(displayOnly).toContain('BOUNDARY NOT PLOTTED')
    expect(displayOnly).not.toContain('<!-- Portion A Polygon -->')
  })

  it('does not plot self-crossing, repeated-vertex, or zero-area rings', () => {
    const data = draft()
    data.portions[0].boundaryPoints = [
      { easting: 0, northing: 0 },
      { easting: 100, northing: 100 },
      { easting: 0, northing: 100 },
      { easting: 100, northing: 0 },
    ]
    expect(renderSubdivisionPlan(data)).toContain('BOUNDARY NOT PLOTTED')

    data.portions[0].boundaryPoints = [
      { easting: 0, northing: 0 },
      { easting: 100, northing: 0 },
      { easting: 100, northing: 100 },
      { easting: 0, northing: 0 },
    ]
    expect(renderSubdivisionPlan(data)).toContain('BOUNDARY NOT PLOTTED')

    data.portions[0].boundaryPoints = [
      { easting: 0, northing: 0 },
      { easting: 50, northing: 0 },
      { easting: 100, northing: 0 },
    ]
    expect(renderSubdivisionPlan(data)).toContain('BOUNDARY NOT PLOTTED')
  })

  it('keeps invalid road geometry out of the drawing and identifies the issue', () => {
    const data = draft()
    data.roadReserves[0].boundaryRings = [[
      { easting: 90, northing: 0 },
      { easting: 110, northing: 100 },
      { easting: 90, northing: 100 },
      { easting: 110, northing: 0 },
    ]]
    const svg = renderSubdivisionPlan(data)
    expect(svg.match(/<!-- Portion A Polygon -->/g)).toHaveLength(1)
    expect(svg).not.toContain('road reserve" />')
    expect(svg).toContain('invalid corridor geometry; not plotted')
  })

  it('allows portions to share a boundary but rejects overlapping portion or road interiors', () => {
    const data = draft()
    data.portions.push({
      id: 'portion-b',
      label: 'B',
      areaHa: 0,
      boundaryPoints: [
        { easting: 200, northing: 0 },
        { easting: 300, northing: 0 },
        { easting: 300, northing: 100 },
        { easting: 200, northing: 100 },
      ],
    })
    expect(renderSubdivisionPlan(data)).toContain('<!-- Portion B Polygon -->')

    data.portions[1].boundaryPoints = [
      { easting: 150, northing: 0 },
      { easting: 250, northing: 0 },
      { easting: 250, northing: 100 },
      { easting: 150, northing: 100 },
    ]
    expect(renderSubdivisionPlan(data)).toContain('BOUNDARY NOT PLOTTED')
  })

  it('escapes user labels and rejects injected SVG fill values', () => {
    const data = draft()
    data.parcelNumber = 'TEST"><script>alert(1)</script>'
    data.portions[0].fillColor = 'url(javascript:alert(1))'
    const svg = renderSubdivisionPlan(data)
    expect(svg).toContain('TEST&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(svg).not.toContain('url(javascript:alert(1))')
  })
})
