import { fireEvent, render, screen } from '@testing-library/react'
import Page from './page'
import { generatePDF } from '@/lib/export/helpers'
jest.mock('@/lib/i18n/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/analytics/events', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/export/helpers', () => ({ generatePDF: jest.fn(), downloadCSV: jest.fn(), toCSV: jest.fn() }))
jest.mock('@/components/SolutionStepsRenderer', () => ({ __esModule: true, default: () => <div>Worked explanation</div> }))

function enterRun() {
  render(<Page />)
  fireEvent.change(screen.getByLabelText('Opening Benchmark (m)'), { target: { value: '100' } })
  const rows = screen.getAllByLabelText('Backsight (m)')
  rows.forEach(input => fireEvent.change(input, { target: { value: '' } }))
  screen.getAllByLabelText('Foresight (m)').forEach(input => fireEvent.change(input, { target: { value: '' } }))
  fireEvent.change(rows[0], { target: { value: '1.5' } })
  if (rows.length === 1) fireEvent.click(screen.getByRole('button', { name: 'toolUI.addReading' }))
  fireEvent.change(screen.getAllByLabelText('Foresight (m)')[1], { target: { value: '1.496' } })
}

test('calculator begins without inventing benchmark or surveyed run length', () => {
  render(<Page />)
  expect(screen.getByLabelText('Opening Benchmark (m)')).toHaveValue('')
  expect(screen.getByLabelText('Distance (km) for allowable error')).toHaveValue('')
})

test('reduction and exported summary retain unknown closure evidence', () => {
  enterRun()
  fireEvent.change(screen.getByLabelText('Distance (km) for allowable error'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'toolUI.calculate' }))
  expect(screen.getByText('Closure not assessed')).toBeInTheDocument()
  expect(screen.queryByText('Unacceptable')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'toolUI.exportPdf' }))
  const summary = jest.mocked(generatePDF).mock.calls.at(-1)?.[1]
  expect(JSON.stringify(summary)).toMatch(/Not assessed/)
  expect(JSON.stringify(summary)).not.toMatch(/0\.000000 m|Unacceptable/)
})

test('invalid supplied length blocks computation instead of becoming a one-kilometre run', () => {
  enterRun()
  fireEvent.change(screen.getByLabelText('Distance (km) for allowable error'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'toolUI.calculate' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/Run length must be a positive number/)
  expect(screen.queryByRole('button', { name: 'toolUI.exportPdf' })).not.toBeInTheDocument()
})

test('editing after calculation removes stale results and export controls', () => {
  enterRun()
  fireEvent.click(screen.getByRole('button', { name: 'toolUI.calculate' }))
  expect(screen.getByRole('button', { name: 'toolUI.exportPdf' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Opening Benchmark (m)'), { target: { value: '200' } })
  expect(screen.queryByRole('button', { name: 'toolUI.exportPdf' })).not.toBeInTheDocument()
  expect(screen.queryByText('Worked explanation')).not.toBeInTheDocument()
})
