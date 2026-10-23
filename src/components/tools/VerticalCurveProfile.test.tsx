import { render, screen } from '@testing-library/react'
import { VerticalCurveProfile, type VerticalCurveProfileProps } from './VerticalCurveProfile'
import { verticalCurve } from '@/lib/computations/roadDesignEngine'

function props(): VerticalCurveProfileProps {
  const curve = verticalCurve({ g1: -2, g2: 4, vpiChainage: 1003, vpiRL: 100, curveLength: 200, interval: 10000 })
  return { rows: curve.profileRows.map(row => ({ chainage: row.chainage, x: row.x, RL: row.rl, grade: row.grade })), bvcChainage: 903, evcChainage: 1103, vpiChainage: 1003, bvcRL: 102, evcRL: 104, vpiRL: 100, g1: -2, g2: 4, isCrest: false, peakPoint: { chainage: 969.6666666666666, RL: 101.33333333333333 } }
}

test('sampled profile connects both computed endpoints with finite in-view geometry', () => {
  const { container } = render(<VerticalCurveProfile {...props()} />)
  expect(screen.getByRole('img', { name: 'Vertical curve elevation profile' })).toBeInTheDocument()
  const svg = container.querySelector('svg')
  const d = svg?.querySelector('path[stroke="#f59e0b"]')?.getAttribute('d')
  if (!svg || !d) throw new Error('Missing profile geometry')
  const points = [...d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }))
  expect(points.length).toBeGreaterThanOrEqual(65)
  const ends = [...svg.querySelectorAll('circle')].slice(0, 2).map(circle => ({ x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) }))
  const last = points.at(-1)
  if (!last) throw new Error('Missing profile endpoint')
  expect(Math.hypot(points[0].x - ends[0].x, points[0].y - ends[0].y)).toBeLessThan(0.1)
  expect(Math.hypot(last.x - ends[1].x, last.y - ends[1].y)).toBeLessThan(0.1)
  for (const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(0)
    expect(point.x).toBeLessThanOrEqual(680)
    expect(point.y).toBeGreaterThanOrEqual(0)
    expect(point.y).toBeLessThanOrEqual(420)
  }
})

test('a legacy sparse table cannot shorten the declared length label', () => {
  const input = props()
  render(<VerticalCurveProfile {...input} rows={input.rows.filter(row => row.chainage < 1103)} />)
  expect(screen.getByText('L = 200.0 m')).toBeInTheDocument()
})

test('an extrapolated or nonfinite peak is never drawn', () => {
  const { container, rerender } = render(<VerticalCurveProfile {...props()} peakPoint={{ chainage: 703, RL: 98 }} />)
  expect(container.querySelector('circle[fill="#a855f7"]')).not.toBeInTheDocument()
  rerender(<VerticalCurveProfile {...props()} peakPoint={{ chainage: 1000, RL: NaN }} />)
  expect(container.querySelector('circle[fill="#a855f7"]')).not.toBeInTheDocument()
})

test('equal-grade profile is labeled straight and does not plot a unique extremum', () => {
  const { container } = render(<VerticalCurveProfile {...props()} g1={2} g2={2} />)
  expect(screen.getByText(/Straight · G1/)).toBeInTheDocument()
  expect(container.querySelector('circle[fill="#a855f7"]')).not.toBeInTheDocument()
})
