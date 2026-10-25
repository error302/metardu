import { fireEvent, render, screen } from '@testing-library/react'
import TraverseFieldBook from '@/components/TraverseFieldBook'

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
jest.mock('@/components/drawing/CoordinateCanvas', () => ({ CoordinateCanvas: () => null }))
jest.mock('@/components/drawing/DrawingExportToolbar', () => ({ __esModule: true, default: () => null }))

function setup() {
  render(<TraverseFieldBook projectId="11111111-1111-4111-8111-111111111111" />)
  const set = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  set('Opening Station', 'A')
  set('Opening Easting (m)', '0')
  set('Opening Northing (m)', '0')
  set('Degrees', '0')
  set('Minutes', '0')
  set('Seconds', '0')
  set('Station', 'B')
  set('Slopedist', '100')
  screen.getAllByLabelText('Observation field').forEach((field, i) => fireEvent.change(field, { target: { value: ['0','0','0','180','0','0','90','0','0'][i] } }))
  return set
}

describe('traverse field book evidence admission', () => {
  it('leaves instrument and target heights empty until entered', () => {
    setup()
    expect(screen.getByLabelText('Ih')).toHaveValue(null)
    expect(screen.getByLabelText('Th')).toHaveValue(null)
    expect(screen.queryByText(/CLOSING CONTROL IS MANDATORY|minimum 2 DISTINCT/)).not.toBeInTheDocument()
  })

  it('computes an open draft without declaring a legal accuracy class', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Compute Traverse/ }))
    expect(screen.getByText('NOT ASSESSED')).toBeInTheDocument()
    expect(screen.queryByText(/FIRST ORDER|prohibited|Reg. 60/)).not.toBeInTheDocument()
  })

  it('allows mathematical loop closure to the opening control', () => {
    const set = setup()
    set(/Closing Easting/, '0')
    set(/Closing Northing/, '0')
    fireEvent.click(screen.getByRole('button', { name: /Compute Traverse/ }))
    expect(screen.getByText('NOT ASSESSED')).toBeInTheDocument()
    expect(screen.queryByText(/must be DIFFERENT/)).not.toBeInTheDocument()
  })

  it('refuses an incomplete added row rather than silently dropping it', () => {
    const set = setup()
    set(/Closing Easting/, '0')
    set(/Closing Northing/, '100')
    fireEvent.click(screen.getByRole('button', { name: /Add Observation Row/ }))
    fireEvent.click(screen.getByRole('button', { name: /Compute Traverse/ }))
    expect(screen.getByText(/Every observation requires/)).toBeInTheDocument()
  })

  it('shows a recomputation state after observations or control change', () => {
    const set = setup()
    fireEvent.click(screen.getByRole('button', { name: /Compute Traverse/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Field Book' }))
    set('Opening Northing (m)', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Results' }))
    expect(screen.queryByText('NOT ASSESSED')).not.toBeInTheDocument()
    expect(screen.getByText(/Recompute the current observations/)).toBeInTheDocument()
  })
})
