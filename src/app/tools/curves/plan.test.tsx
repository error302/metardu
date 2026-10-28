import { act, fireEvent, render, screen } from '@testing-library/react'
import CurvesCalculator from './page'

const compound = { 'Radius R1 (m)': '100', 'Radius R2 (m)': '200', 'Δ1 (degrees)': '60', 'Δ2 (degrees)': '30', 'Junction Chainage (m)': '500' }
function enter(values: Record<string, string>) { for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
const calculate = () => fireEvent.click(screen.getByRole('button', { name: /^(Calculate|toolUI.calculate)$/ }))

test('compound begins blank and refuses missing geometry inline', () => {
  render(<CurvesCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Compound Curve' }))
  expect(screen.getByLabelText('Radius R1 (m)')).toHaveValue('')
  calculate()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /export.*csv/i })).not.toBeInTheDocument()
})

test('compound exposes arc stationing and clears stale result after an edit', () => {
  render(<CurvesCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Compound Curve' }))
  enter(compound); calculate()
  expect(screen.getAllByText(/395.280/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/604.720/).length).toBeGreaterThan(0)
  fireEvent.change(screen.getByLabelText('Radius R1 (m)'), { target: { value: '' } })
  expect(screen.queryByText(/395.280/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /export.*csv/i })).not.toBeInTheDocument()
})

test('numeric suffix cannot be silently parsed into usable geometry', () => {
  render(<CurvesCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Compound Curve' }))
  enter({ ...compound, 'Radius R1 (m)': '100m' }); calculate()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /export.*csv/i })).not.toBeInTheDocument()
})

test('reverse requires both deflections rather than displaying assumed semicircle lengths', () => {
  render(<CurvesCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Reverse Curve' }))
  expect(screen.getByLabelText('Δ1 (degrees)')).toHaveValue('')
  expect(screen.getByLabelText('Δ2 (degrees)')).toHaveValue('')
  calculate()
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

test('reverse rejects overlapping arcs and shows declared path length for a valid PI separation', () => {
  render(<CurvesCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Reverse Curve' }))
  enter({ 'Radius R1 (m)': '100', 'Radius R2 (m)': '200', 'Δ1 (degrees)': '60', 'Δ2 (degrees)': '60', 'Distance AB (m)': '150' })
  calculate()
  expect(screen.getByRole('alert')).toHaveTextContent(/overlap/i)
  fireEvent.change(screen.getByLabelText('Distance AB (m)'), { target: { value: '300' } })
  calculate()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getAllByText(/440.954/).length).toBeGreaterThan(0)
  expect(screen.getByRole('status')).toHaveTextContent('NOT ASSESSED')
  expect(screen.queryByText(/RDM 1.3 Compliance/)).not.toBeInTheDocument()
})

test('simple DMS rejects out-of-range minutes inline without stale exports', () => {
  render(<CurvesCalculator />)
  enter({ 'Radius (m)': '100', 'PI Chainage (m)': '500', 'Interval (m)': '20', 'Deflection degrees': '60', 'Deflection minutes': '60', 'Deflection seconds': '0' })
  calculate()
  expect(screen.getByRole('alert')).toHaveTextContent(/DMS/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('compound CSV downloads full-precision arc stations and draft provenance', async () => {
  const blobs: Blob[] = []
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = blob => { blobs.push(blob as Blob); return 'blob:synthetic-local-export' }
  URL.revokeObjectURL = () => {}
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    render(<CurvesCalculator />)
    fireEvent.click(screen.getByRole('button', { name: 'Compound Curve' }))
    enter(compound); calculate()
    fireEvent.click(screen.getByRole('button', { name: 'Export Local Draft CSV' }))
    expect(blobs).toHaveLength(1)
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blobs[0])
    })
    expect(csv).toContain('395.2802448803402')
    expect(csv).toContain('PCC_m,500')
    expect(csv).toContain('LOCAL_CALCULATION_DRAFT,NOT_ASSESSED,NOT_VERIFIED')
  } finally { await new Promise(resolve => setTimeout(resolve, 1100)); click.mockRestore(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke }
})

test('late PDF renderer cannot export a calculation after an input edit', async () => {
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    render(<CurvesCalculator />)
    fireEvent.click(screen.getByRole('button', { name: 'Compound Curve' }))
    enter(compound); calculate()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export Local Draft PDF' }))
      fireEvent.change(screen.getByLabelText('Radius R1 (m)'), { target: { value: '101' } })
      await Promise.resolve()
    })
    expect(click).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Export Local Draft PDF' })).not.toBeInTheDocument()
  } finally { click.mockRestore() }
})
