import { fireEvent, render, screen } from '@testing-library/react'
import { HorizontalCurvePanel } from '../HorizontalCurvePanel'
import SuperelevationPanel from '../SuperelevationPanel'
import * as compute from '@/lib/engineering/compute'

// The old render-time logger writes through the API client. Keep that external
// boundary inert while exercising the actual panels and calculation engines.
jest.spyOn(compute, 'logEngineeringCompute').mockResolvedValue(undefined)

test.each([
  ['horizontal', HorizontalCurvePanel], ['banking', SuperelevationPanel],
] as const)('%s quick compute requires inputs before a verdict or export', (_name, Panel) => {
  render(<Panel projectId="synthetic-project" />)
  expect(screen.queryByRole('button', { name: /Export.*DXF/i })).not.toBeInTheDocument()
  expect(screen.queryByText(/Sight distance adequate|within 7% limit|Standards Violations/)).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('project quick curve reaches the same TC/CT and consecutive chords as the reviewed calculator', () => {
  render(<HorizontalCurvePanel />)
  for (const [label, value] of [['Radius R (m)', '100'], ['Δ Degrees', '60'], ['IP Chainage (m)', '500']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('button', { name: /Export.*DXF/i })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Set-Out Table' }))
  expect(screen.getByRole('table')).toHaveTextContent('442.265')
  expect(screen.getByRole('table')).toHaveTextContent('546.985')
  expect(screen.getByRole('table')).toHaveTextContent('19.967')
  fireEvent.change(screen.getByLabelText('Radius R (m)'), { target: { value: '' } })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Export.*DXF/i })).not.toBeInTheDocument()
})

test('changing a declared export direction requires a fresh curve calculation', () => {
  render(<HorizontalCurvePanel />)
  for (const [label, value] of [['Radius R (m)', '100'], ['Δ Degrees', '60'], ['IP Chainage (m)', '500']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.change(screen.getByLabelText('Curve Direction (local DXF)'), { target: { value: 'right' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
  expect(screen.getByRole('button', { name: /Export.*DXF/i })).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Curve Direction (local DXF)'), { target: { value: 'left' } })
  expect(screen.queryByRole('button', { name: /Export.*DXF/i })).not.toBeInTheDocument()
})

test('project banking retains over-limit input and needs declared criteria', () => {
  render(<SuperelevationPanel />)
  const bank = { 'Design Speed (km/h)': '80', 'Curve Radius R (m)': '300', 'Number of Lanes Rotated': '1', 'Lane Width (m)': '3.5', 'Initial Crossfall (%)': '-2.5', 'Provided Superelevation (%)': '10', 'Criteria Reference / Revision': 'Synthetic revision 1', 'Lateral Friction Factor': '0.14', 'Maximum Superelevation (%)': '8', 'Maximum Relative Gradient (%)': '0.5' }
  for (const [label, value] of Object.entries(bank)) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute Superelevation' }))
  expect(screen.getByRole('status')).toHaveTextContent('DO NOT MEET')
  expect(screen.getByText('10.0000%')).toBeInTheDocument()
  expect(screen.getByText('87.500 m')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Criteria Reference / Revision'), { target: { value: '' } })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Export.*DXF/i })).not.toBeInTheDocument()
})
