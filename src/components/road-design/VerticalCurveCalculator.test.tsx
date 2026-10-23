import { fireEvent, render, screen, within } from '@testing-library/react'
import VerticalCurveCalculator from './VerticalCurveCalculator'

function enterCurve() {
  render(<VerticalCurveCalculator />)
  for (const [label, value] of [['G₁ — Incoming Grade (%)', '-2'], ['G₂ — Outgoing Grade (%)', '4'], ['VPI Chainage (m)', '1003'], ['VPI Reduced Level (m)', '100'], ['Curve Length L (m)', '200'], ['RL Table Interval (m)', '20']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
}

test('table includes true BVC/EVC and marks only the exact sag point', () => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  expect(rows[1]).toHaveTextContent('903.000')
  expect(rows.at(-1)).toHaveTextContent('1103.000')
  expect(screen.getByText('LOW POINT')).toBeInTheDocument()
  expect(screen.queryByText('PEAK')).not.toBeInTheDocument()
})

test.each(['G₁ — Incoming Grade (%)', 'G₂ — Outgoing Grade (%)', 'VPI Chainage (m)', 'VPI Reduced Level (m)', 'Curve Length L (m)', 'RL Table Interval (m)'])('editing %s clears stale table and profile', label => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  fireEvent.change(screen.getByLabelText(label), { target: { value: '1' } })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByText('Vertical Curve Profile')).not.toBeInTheDocument()
})

test('switching length authority clears prior output', () => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  fireEvent.click(screen.getByRole('button', { name: 'K' }))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('no geometry or elevation is invented before entry', () => {
  render(<VerticalCurveCalculator />)
  for (const label of ['G₁ — Incoming Grade (%)', 'G₂ — Outgoing Grade (%)', 'VPI Chainage (m)', 'VPI Reduced Level (m)', 'Curve Length L (m)']) expect(screen.getByLabelText(label)).toHaveValue(null)
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test.each(['0', '-1', '0.00000001', ''])('invalid interval %s is reported inline without stale output', value => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  fireEvent.change(screen.getByLabelText('RL Table Interval (m)'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('equal grades show straight profile and no invented K or turning point', () => {
  enterCurve()
  fireEvent.change(screen.getByLabelText('G₁ — Incoming Grade (%)'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByText('Straight (A = 0)')).toBeInTheDocument()
  expect(screen.getByText('Undefined (equal grades)')).toBeInTheDocument()
  expect(screen.getByText('No unique point on curve')).toBeInTheDocument()
  expect(screen.queryByText('LOW POINT')).not.toBeInTheDocument()
})
