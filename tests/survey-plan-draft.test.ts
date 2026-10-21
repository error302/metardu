import { SurveyPlanRenderer } from '@/lib/reports/surveyPlan/renderer'
import { FormNo4Renderer } from '@/lib/reports/surveyPlan/formNo4Renderer'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'
import { mmToPx, shoelaceArea } from '@/lib/reports/surveyPlan/geometry'

const data: SurveyPlanData = {
  project: { name: 'FICTIONAL SIMULATION — not field evidence', location: '', utm_zone: 37, hemisphere: 'S', datum: 'WGS84', notes: 'Imagery simulation. Height and control accuracy unknown.' },
  parcel: { boundaryPoints: [
    { name: 'SIM-1', easting: 500000, northing: 9900000 },
    { name: 'SIM-2', easting: 500020, northing: 9900000 },
    { name: 'SIM-3', easting: 500020, northing: 9900040 },
    { name: 'SIM-4', easting: 500000, northing: 9900040 },
  ], area_sqm: 800, perimeter_m: 120 }, controlPoints: [], traverse: { linearError: 0 },
}
const render = (layout: string, value = data) => layout === 'form4'
  ? new FormNo4Renderer(value, { scale: 200, watermarkPlan: 'pro' }).renderFormNo4()
  : new SurveyPlanRenderer(value, { scale: 200, watermarkPlan: 'pro' }).render()

test.each(['standard', 'form4'])('%s keeps the title block and final notice within printable margins', async layout => {
  const xml = new DOMParser().parseFromString(await render(layout), 'image/svg+xml')
  const block = xml.querySelector('.sheet-identity > rect')
  if (!block) throw new Error('Printed sheet identity is missing')
  expect(Number(block.getAttribute('y')) + Number(block.getAttribute('height'))).toBeLessThan(mmToPx(277))
  expect(xml.querySelector('.sheet-identity')?.textContent).toContain('Grid area: 800.000 m²')
  for (const label of Array.from(xml.querySelectorAll('text')).filter(node => /Content fingerprint:|not certification|Fingerprint identifies/.test(node.textContent || ''))) {
    expect(Number(label.getAttribute('y'))).toBeLessThanOrEqual(mmToPx(287))
  }
})

test('printed area is stable for a small parcel in large projected coordinates', () => {
  const points = [{ easting: 0, northing: 0 }, { easting: 0.125, northing: 0 }, { easting: 0.125, northing: 0.25 }, { easting: 0, northing: 0.25 }]
  expect(shoelaceArea(points.map(point => ({ easting: point.easting + 500000, northing: point.northing + 9900000 })))).toBe(shoelaceArea(points))
})

test('large extents use a bounded number of display grid samples', () => {
  class GridProbe extends SurveyPlanRenderer {
    renderGridBounded() {
      let samples = 0
      this.toSvgX = () => { if (++samples > 200) throw new Error('Unbounded display grid'); return 100 }
      this.toSvgY = () => { if (++samples > 200) throw new Error('Unbounded display grid'); return 100 }
      return this.drawGrid()
    }
  }
  const boundaryPoints = data.parcel.boundaryPoints.map(point => ({ ...point, easting: point.easting * 10000, northing: point.northing * 10000 }))
  expect(() => new GridProbe({ ...data, parcel: { ...data.parcel, boundaryPoints } }).renderGridBounded()).not.toThrow()
})

test('standard-layout area annotations use paper coordinates', async () => {
  const xml = new DOMParser().parseFromString(await render('standard'), 'image/svg+xml')
  const label = Array.from(xml.querySelectorAll('text')).find(node => node.textContent === '800.00 m²')
  if (!label) throw new Error('The parcel area label is missing')
  expect(Number(label.getAttribute('x'))).toBeGreaterThan(mmToPx(10))
  expect(Number(label.getAttribute('x'))).toBeLessThan(mmToPx(310))
  expect(Number(label.getAttribute('y'))).toBeGreaterThan(mmToPx(10))
  expect(Number(label.getAttribute('y'))).toBeLessThan(mmToPx(240))
})

test('standard paper tables stack without overlapping or crossing the footer', async () => {
  const xml = new DOMParser().parseFromString(await render('standard'), 'image/svg+xml')
  const sections = Array.from(xml.querySelectorAll('.plan-panel-section'))
  expect(sections.length).toBeGreaterThanOrEqual(5)
  let bottom = 0
  for (const section of sections) {
    const rect = section.querySelector('rect')
    if (!rect) throw new Error('Missing table frame')
    const top = Number(rect.getAttribute('y')), height = Number(rect.getAttribute('height'))
    expect(top).toBeGreaterThan(bottom)
    bottom = top + height
    expect(bottom).toBeLessThan(mmToPx(243))
    for (const text of Array.from(section.querySelectorAll('text'))) {
      expect(Number(text.getAttribute('y'))).toBeGreaterThan(top)
      expect(Number(text.getAttribute('y'))).toBeLessThan(bottom)
    }
  }
  expect(xml.querySelector('.standard-plan-panel')?.textContent).not.toContain('SURVEYORS ASSOCIATION STAMP')
})

test.each(['standard', 'form4'])('%s paginates a large schedule without dropping stations or duplicating the drawing', async layout => {
  const boundaryPoints = Array.from({ length: 80 }, (_, index) => ({ name: `Station-${index + 1}`, easting: 500000 + 20 * Math.cos(index * Math.PI / 40), northing: 9900000 + 20 * Math.sin(index * Math.PI / 40) }))
  const svg = await render(layout, { ...data, project: { ...data.project, totalSheets: '99' }, parcel: { ...data.parcel, boundaryPoints } })
  const xml = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const sheets = Array.from(xml.documentElement.children).filter(node => node.classList.contains('survey-plan-sheet'))
  expect(sheets.length).toBeGreaterThan(1)
  expect(sheets.length).toBeLessThan(10)
  expect(sheets[0].querySelector('polygon, polyline')).not.toBeNull()
  for (const sheet of sheets.slice(1)) expect(sheet.querySelector('polygon, polyline')).toBeNull()
  const scheduleNames = Array.from(xml.querySelectorAll('.plan-panel-section text')).map(node => node.textContent).filter(value => /^Station-\d+$/.test(value || ''))
  // Original station key, coordinates, and both ends of the closed bearing schedule.
  for (const point of boundaryPoints) expect(scheduleNames.filter(value => value === point.name)).toHaveLength(4)
  expect(svg).toContain('complete leg dimensions are in the schedules')
})

test.each(['standard', 'form4'])('%s preserves unverified provenance even on a paid plan, without fabricated certification or road facts', async layout => {
  const svg = await render(layout)
  expect(svg).toContain('UNVERIFIED DRAFT')
  expect(svg).toContain('FICTIONAL SIMULATION')
  expect(svg).toContain('Imagery simulation.')
  expect(svg).toContain('Content fingerprint:')
  expect(svg).not.toMatch(/hereby certify|OFFICIAL SEAL|SURVEY OF KENYA|FIRST ORDER|All new roads|truncations ±6mm|Initial issue|invalidates verification/)
  for (const name of ['SIM-1', 'SIM-2', 'SIM-3', 'SIM-4']) expect(svg).toContain(name)
  // A 40 mm bar at 1:200 is eight ground metres, not 800 metres.
  expect(svg).toMatch(/>8<\/text>/)
  expect(svg).not.toMatch(/>800<\/text>/)
})

test.each(['standard', 'form4'])('%s does not guess a datum or zone when report metadata is incomplete', async layout => {
  const svg = await render(layout, { ...data, project: { ...data.project, datum: undefined } })
  expect(svg).toContain('UNVERIFIED')
  expect(svg).not.toContain('ARC1960')
})

test('road width requires an explicit value; classification alone is not recorded width evidence', async () => {
  const withClass = { ...data, project: { ...data.project, road_class: 'A' } }
  expect(await render('form4', withClass)).not.toContain('Recorded road reserve width:')
  expect(await render('form4', { ...withClass, project: { ...withClass.project, roadReserveWidthMetres: 15 } })).toContain('Recorded road reserve width: 15.00 m (review required)')
})

test('the title uses the rendered scale rather than conflicting free-text metadata', async () => {
  const svg = await render('form4', { ...data, project: { ...data.project, scale: '1:999' } })
  expect(svg).toContain('1:200')
  expect(svg).not.toContain('1:999')
})

test.each(['standard', 'form4'])('%s rejects nonfinite and crossing boundary geometry before export', async layout => {
  const points = data.parcel.boundaryPoints
  for (const boundaryPoints of [[...points.slice(0, 3), { ...points[3], easting: Infinity }], [points[0], points[2], points[1], points[3]]]) {
    await expect(render(layout, { ...data, parcel: { ...data.parcel, boundaryPoints } })).rejects.toThrow(/boundary/i)
  }
})

function bearingLabels(svg: string) {
  const xml = new DOMParser().parseFromString(svg, 'image/svg+xml')
  return Array.from(xml.querySelectorAll('text')).filter(element => !element.closest('.plan-panel-section') && /^\d{3}°\d{2}'/.test(element.textContent ?? ''))
}

test('grid-coordinate leg labels are positioned inside the drawing viewport', async () => {
  const labels = bearingLabels(await render('form4'))
  expect(labels).toHaveLength(4)
  for (const label of labels) {
    const transform = label.parentElement?.parentElement?.getAttribute('transform') ?? ''
    const match = transform.match(/^translate\(([-\d.]+),([-\d.]+)\)$/)
    expect(match).not.toBeNull()
    const x = Number(match?.[1]), y = Number(match?.[2])
    expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1588)
    expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(1123)
  }
})

test('rotating a drawing cannot change the recorded grid bearings', async () => {
  const normal = bearingLabels(await render('form4')).map(label => label.textContent)
  const rotated = bearingLabels(await render('form4', { ...data, project: { ...data.project, northRotationDeg: 45 } })).map(label => label.textContent)
  expect(rotated).toEqual(normal)
})
