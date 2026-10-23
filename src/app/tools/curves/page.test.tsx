import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CurvesCalculator from './page'

function openVertical() {
  render(<CurvesCalculator />)
  fireEvent.click(screen.getByRole('button', { name: 'Vertical Curve' }))
}
function enter() {
  openVertical()
  fireEvent.change(screen.getByLabelText(/G₁ — Incoming Grade|G1 — Entry Grade/), { target: { value: '-2' } })
  fireEvent.change(screen.getByLabelText(/G₂ — Outgoing Grade|G2 — Exit Grade/), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText(/VPI Reduced Level \(m\)|VPI RL \(m\)/), { target: { value: '100' } })
  const station = screen.queryByLabelText('VPI Chainage (m)')
  if (station) fireEvent.change(station, { target: { value: '1003' } })
  else {
    fireEvent.change(screen.getByLabelText('VPI km'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('VPI m'), { target: { value: '3' } })
    fireEvent.click(screen.getByLabelText('Enter curve length directly'))
  }
  fireEvent.change(screen.getByLabelText('Curve Length L (m)'), { target: { value: '200' } })
}
const compute = () => fireEvent.click(screen.getByRole('button', { name: /^(Compute|Calculate Vertical Curve)$/ }))

test('vertical route begins without invented grades, level or exportable results', () => {
  openVertical()
  expect(screen.getByLabelText(/G₁ — Incoming Grade|G1 — Entry Grade/)).toHaveDisplayValue('')
  expect(screen.getByLabelText(/VPI Reduced Level \(m\)|VPI RL \(m\)/)).toHaveDisplayValue('')
  compute()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('route includes the exact sag minimum and avoids an unadopted K compliance verdict', () => {
  enter(); compute()
  expect(screen.getByRole('table')).toHaveTextContent('969.667')
  expect(screen.getByRole('table')).toHaveTextContent('LOW POINT')
  expect(screen.getByRole('table')).toHaveTextContent('1103.000')
  expect(screen.queryByText(/K-Compliance|RDM 1.3 min K/)).not.toBeInTheDocument()
})

test('editing a grade clears profile, table and both export actions', () => {
  enter(); compute()
  fireEvent.change(screen.getByLabelText(/G₂ — Outgoing Grade|G2 — Exit Grade/), { target: { value: '6' } })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /export.*(pdf|csv)/i })).not.toBeInTheDocument()
})

test('equal grades retain a straight profile instead of an invented sag or rejected curve', () => {
  enter()
  fireEvent.change(screen.getByLabelText(/G₁ — Incoming Grade|G1 — Entry Grade/), { target: { value: '4' } })
  compute()
  expect(screen.getByText('Straight (A = 0)')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('CSV download retains the exact stationary point and draft/reference provenance', async () => {
  const blobs: Blob[] = []
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = blob => { blobs.push(blob as Blob); return 'blob:synthetic-download' }
  URL.revokeObjectURL = () => {}
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    enter(); compute()
    fireEvent.click(screen.getByRole('button', { name: /export.*csv/i }))
    expect(blobs).toHaveLength(1) // CSV must not wait for the PDF renderer chunk.
    await waitFor(() => expect(blobs).toHaveLength(1))
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blobs[0])
    })
    expect(csv).toContain('969.6666666666666')
    expect(csv).toContain('LOCAL_CALCULATION_DRAFT')
    expect(csv).toContain('NOT_ASSESSED')
    expect(csv).toContain('NOT_VERIFIED')
  } finally { click.mockRestore(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke }
})
