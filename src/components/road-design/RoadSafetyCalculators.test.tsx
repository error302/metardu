import { fireEvent, render, screen } from '@testing-library/react'
import SightDistanceChecker from './SightDistanceChecker'
import SuperelevationCalculator from './SuperelevationCalculator'

function enter(entries: Record<string, string>) {
  for (const [label, value] of Object.entries(entries)) fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
const sight = { 'Design Speed (km/h)': '80', 'Gradient (%)': '0', 'Criteria Reference / Revision': 'Synthetic criteria rev 1', 'Longitudinal Friction Factor': '0.35', 'Reaction Time (s)': '2.5', 'Adopted Minimum SSD (m) — optional': '140' }
const bank = { 'Design Speed (km/h)': '80', 'Curve Radius R (m)': '300', 'Number of Lanes Rotated': '1', 'Lane Width (m)': '3.5', 'Initial Crossfall (%)': '-2.5', 'Provided Superelevation (%)': '6', 'Criteria Reference / Revision': 'Synthetic criteria rev 1', 'Lateral Friction Factor': '0.14', 'Maximum Superelevation (%)': '8', 'Maximum Relative Gradient (%)': '0.5' }

test('sight calculator begins without assumed geometry or criteria and reports missing data inline', () => {
  render(<SightDistanceChecker />)
  expect(screen.getByLabelText('Design Speed (km/h)')).toHaveValue(null)
  fireEvent.click(screen.getByRole('button', { name: 'Check Sight Distance' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('missing availability remains unassessed and zero availability fails the actual comparison', () => {
  render(<SightDistanceChecker />); enter(sight)
  fireEvent.click(screen.getByRole('button', { name: 'Check Sight Distance' }))
  expect(screen.getByRole('status')).toHaveTextContent('SSD comparison: UNASSESSED. PSD comparison: UNASSESSED.')
  enter({ 'Available SSD (m) — optional': '0' })
  fireEvent.click(screen.getByRole('button', { name: 'Check Sight Distance' }))
  expect(screen.getByRole('status')).toHaveTextContent('SSD comparison: FAIL')
  expect(screen.queryByText('Python RDM 1.3 Validation Engine')).not.toBeInTheDocument()
})

test.each(['Design Speed (km/h)', 'Gradient (%)', 'Criteria Reference / Revision', 'Longitudinal Friction Factor', 'Reaction Time (s)', 'Available SSD (m) — optional', 'Adopted Minimum SSD (m) — optional', 'Available PSD (m) — optional', 'Adopted Minimum PSD (m) — optional'])('editing %s clears stale sight verdicts', label => {
  render(<SightDistanceChecker />); enter(sight)
  fireEvent.click(screen.getByRole('button', { name: 'Check Sight Distance' }))
  enter({ [label]: '1' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.queryByText('Show Computation Steps')).not.toBeInTheDocument()
})

test('radius comparison uses declared minimum and never claims radius proves visibility', () => {
  render(<SightDistanceChecker />)
  enter({ 'Criteria Reference / Revision': 'Synthetic radius rev 2', 'Proposed Radius R (m)': '300', 'Adopted Minimum Radius (m)': '400' })
  fireEvent.click(screen.getByRole('button', { name: 'Compare Radius' }))
  expect(screen.getByRole('status')).toHaveTextContent('Radius comparison: FAIL. Visibility is not assessed.')
  enter({ 'Proposed Radius R (m)': '500' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Compare Radius' }))
  expect(screen.getByRole('status')).toHaveTextContent('Radius comparison: PASS. Visibility is not assessed.')
})

test('banking calculator uses explicit rotation width and percent-to-ratio conversion', () => {
  render(<SuperelevationCalculator />); enter(bank)
  fireEvent.click(screen.getByRole('button', { name: 'Compute Superelevation' }))
  expect(screen.getByText('59.500 m')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Banking checks: MEET supplied friction and banking limit')
  expect(screen.queryByText(/Compliant with RDM/)).not.toBeInTheDocument()
})

test('over-limit supplied banking is retained and reported as failing criteria', () => {
  render(<SuperelevationCalculator />); enter({ ...bank, 'Provided Superelevation (%)': '10' })
  fireEvent.click(screen.getByRole('button', { name: 'Compute Superelevation' }))
  expect(screen.getByText('10.0000%')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('DO NOT MEET')
})

test.each(Object.keys(bank))('editing %s clears banking output', label => {
  render(<SuperelevationCalculator />); enter(bank)
  fireEvent.click(screen.getByRole('button', { name: 'Compute Superelevation' }))
  enter({ [label]: '2' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('missing criteria never produce precomputed banking or crash the page', () => {
  render(<SuperelevationCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Compute Superelevation' }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
