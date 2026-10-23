import { render, screen } from '@testing-library/react'
import { SimpleCurveDiagram } from './SimpleCurveDiagram'
import { horizontalCurveElements } from '@/lib/computations/roadDesignEngine'

test.each([10, 60, 120, 179])('diagram connects to the tangent points and fits the viewport for %s degrees', degrees => {
  const curve = horizontalCurveElements({ radius: 100, deflectionAngleDeg: degrees, deflectionAngleMin: 0, deflectionAngleSec: 0, ipChainage: 500 })
  const { container } = render(<SimpleCurveDiagram radius={100} deflectionDeg={degrees} tangentLength={curve.tangentLength} arcLength={curve.curveLength} longChord={curve.longChord} externalDistance={curve.externalDistance} midOrdinate={curve.midOrdinate} pcChainage={curve.tcChainage} piChainage={500} ptChainage={curve.ctChainage} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('Missing curve diagram')
  const points = [...svg.querySelectorAll('circle')].map(p => ({ x: Number(p.getAttribute('cx')), y: Number(p.getAttribute('cy')) }))
  const [pi, pc, pt, centre] = points
  const arc = svg.querySelector('path[stroke="#f59e0b"]')?.getAttribute('d')
  if (!arc) throw new Error('Missing curve arc')
  const arcPoints = [...arc.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }))
  expect(Math.hypot(arcPoints[0].x - pc.x, arcPoints[0].y - pc.y)).toBeLessThan(0.1)
  const end = arcPoints.at(-1)
  if (!end) throw new Error('Missing curve endpoint')
  expect(Math.hypot(end.x - pt.x, end.y - pt.y)).toBeLessThan(0.1)
  const radius = Math.hypot(pc.x - centre.x, pc.y - centre.y)
  expect(Math.hypot(pt.x - centre.x, pt.y - centre.y)).toBeCloseTo(radius, 6)
  const tangent = Math.hypot(pt.x - pi.x, pt.y - pi.y)
  const cosine = ((pt.x - pi.x) * (pt.x - centre.x) + (pt.y - pi.y) * (pt.y - centre.y)) / (tangent * radius)
  expect(Math.abs(cosine)).toBeLessThan(1e-10)
  for (const point of [...points, ...arcPoints]) {
    expect(point.x).toBeGreaterThanOrEqual(0)
    expect(point.x).toBeLessThanOrEqual(640)
    expect(point.y).toBeGreaterThanOrEqual(0)
    expect(point.y).toBeLessThanOrEqual(460)
  }
  expect(screen.queryByText('N', { selector: 'svg text' })).not.toBeInTheDocument()
})
