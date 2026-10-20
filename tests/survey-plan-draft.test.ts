import { SurveyPlanRenderer } from '@/lib/reports/surveyPlan/renderer'
import { FormNo4Renderer } from '@/lib/reports/surveyPlan/formNo4Renderer'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'

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
  return Array.from(xml.querySelectorAll('text')).filter(element => /^\d{3}°\d{2}'/.test(element.textContent ?? ''))
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
