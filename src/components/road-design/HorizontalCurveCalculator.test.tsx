import { fireEvent, render, screen, within } from '@testing-library/react'
import HorizontalCurveCalculator from './HorizontalCurveCalculator'

function enterCurve() {
  render(<HorizontalCurveCalculator />)
  for (const [label, value] of [['Radius R (m)', '100'], ['Δ Degrees', '60'], ['Δ Minutes', '0'], ['Δ Seconds', '0'], ['IP Chainage (m)', '500']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Set-Out Table' }))
  fireEvent.change(screen.getByLabelText('Peg Interval (m)'), { target: { value: '20' } })
}

test('set-out table uses the entered PI and reaches half the central angle', () => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  expect(rows).toHaveLength(8)
  expect(rows[1]).toHaveTextContent('442.265')
  expect(rows.at(-1)).toHaveTextContent('546.985')
  expect(rows.at(-1)).toHaveTextContent('30°00\'00.0"')
})

test.each(['Radius R (m)', 'Δ Degrees', 'Δ Minutes', 'Δ Seconds', 'IP Chainage (m)', 'Peg Interval (m)'])('editing %s removes the stale table', label => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('table')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(label), { target: { value: '1' } })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('invalid DMS is reported without a numeric result', () => {
  enterCurve()
  fireEvent.change(screen.getByLabelText('Δ Minutes'), { target: { value: '60' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/minutes/i)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('calculator starts without inventing design geometry or PI chainage', () => {
  render(<HorizontalCurveCalculator />)
  for (const label of ['Radius R (m)', 'Δ Degrees', 'IP Chainage (m)']) expect(screen.getByLabelText(label)).toHaveValue(null)
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test.each(['0', '-1', '0.000000001', ''])('unsafe or missing interval %s produces an error and no output', interval => {
  enterCurve()
  fireEvent.change(screen.getByLabelText('Peg Interval (m)'), { target: { value: interval } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('editing setup clears diagram and computation steps as well as the table', () => {
  enterCurve()
  fireEvent.click(screen.getByRole('button', { name: 'Curve Elements' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('img', { name: 'Simple circular curve schematic' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('IP Chainage (m)'), { target: { value: '600' } })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByText('Show Computation Steps')).not.toBeInTheDocument()
})
