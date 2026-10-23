import { bankingSectionDraftDxf, horizontalCurveDraftDxf } from '../roadQuickComputeDxf'

// Read the actual exported DXF tags, not dxf-writer calls. An independent CAD
// reader is also used on retained fixtures in the verification checkpoint.
function records(content: string) {
  const lines = content.trim().split(/\r?\n/)
  const records: Map<number, string>[] = []
  let current = new Map<number, string>()
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i].trim()); const value = lines[i + 1].trim()
    if (code === 0) { records.push(current); current = new Map() }
    current.set(code, value)
  }
  records.push(current)
  return records
}
const curve = { radius: 100, deflectionAngleDeg: 60, deflectionAngleMin: 0, deflectionAngleSec: 0, ipChainage: 500 }
const banking = { designSpeed: 80, radius: 300, numLanes: 1, laneWidth: 3.5, initialCrossfall: -0.025, providedSuperelevation: 0.1,
  criteria: { reference: 'Synthetic criteria rev 1', lateralFriction: 0.14, maximumSuperelevation: 0.08, maximumRelativeGradient: 0.005 } }

test.each([
  ['left', 100, 270, 330, 50], ['right', -100, 30, 90, -50],
] as const)('%s draft contains the actual full-size circle and peg endpoints', (direction, cy, start, end, ptY) => {
  const dxf = horizontalCurveDraftDxf(curve, 20, direction)
  const entities = records(dxf)
  expect(dxf).toMatch(/\$INSUNITS\r?\n70\r?\n6\r?\n/)
  const arcs = entities.filter(row => row.get(0) === 'ARC')
  expect(arcs).toHaveLength(1)
  expect(Number(arcs[0].get(10))).toBe(0)
  expect(Number(arcs[0].get(20))).toBe(cy)
  expect(Number(arcs[0].get(40))).toBe(100)
  expect(Number(arcs[0].get(50))).toBeCloseTo(start, 10)
  expect(Number(arcs[0].get(51))).toBeCloseTo(end, 10)
  const points = entities.filter(row => row.get(0) === 'POINT')
  expect(points).toHaveLength(7)
  expect(Number(points[0].get(10))).toBe(0)
  expect(Number(points[0].get(20))).toBe(0)
  expect(Number(points.at(-1)?.get(10))).toBeCloseTo(86.6025403784, 9)
  expect(Number(points.at(-1)?.get(20))).toBeCloseTo(ptY, 9)
  expect(dxf).toContain('no CRS, bearing or project placement')
  expect(dxf).toContain('NOT ASSESSED')
})

test('banking draft uses the actual rotated width and retains failed provided banking', () => {
  const dxf = bankingSectionDraftDxf(banking)
  const section = records(dxf).find(row => row.get(0) === 'LINE' && row.get(8) === 'GEOMETRY')
  expect(Number(section?.get(11))).toBe(3.5)
  expect(Number(section?.get(21))).toBeCloseTo(0.35, 12)
  expect(dxf).toContain('Banking checks=FAIL; standard compliance=NOT_ASSESSED')
  expect(dxf).toContain('rotation length=87.5 m')
  expect(dxf).toContain('Synthetic criteria rev 1')
  expect(dxf).toContain('Side friction=0.14; maximum e=8%; relative gradient=0.5%')
})

test('multiline criteria remain one text record and cannot inject DXF entities', () => {
  const dxf = bankingSectionDraftDxf({ ...banking, criteria: { ...banking.criteria, reference: 'criteria\n0\nLINE\n8\nINJECTED' } })
  expect(records(dxf).filter(row => row.get(0) === 'LINE')).toHaveLength(3)
  expect(dxf).toContain('Declared criteria: criteria 0 LINE 8 INJECTED')
})

test('export refuses undeclared direction, invalid intervals and missing banking criteria', () => {
  expect(() => horizontalCurveDraftDxf(curve, 20, '' as 'left')).toThrow(/direction/)
  expect(() => horizontalCurveDraftDxf(curve, 0, 'left')).toThrow(/interval/i)
  expect(() => bankingSectionDraftDxf({ ...banking, criteria: undefined })).toThrow(/criteria/)
})
