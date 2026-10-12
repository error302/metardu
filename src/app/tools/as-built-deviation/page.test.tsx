import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import AsBuiltDeviationPage from './page'

jest.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => null }))

describe('as-built deviation review page', () => {
  it('starts empty, requires project tolerance values, and labels example data as fictional', () => {
    render(<AsBuiltDeviationPage />)

    expect(screen.getByLabelText('Design chainage row 1 (m)')).toHaveValue(null)
    expect(screen.getByLabelText('Observed chainage row 1 (m)')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/vertical datum and benchmark/i)

    fireEvent.change(screen.getByLabelText('Vertical datum and benchmark/control reference'), { target: { value: 'BM-01 · project datum' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/tolerance source/i)

    fireEvent.click(screen.getByRole('button', { name: 'Load fictional training example' }))
    expect(screen.getByText(/EXAMPLE DATA — fictional training values/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Point ID row 1')).toHaveValue('TRAIN-01')

    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/finite non-negative pass limit/i)
    fireEvent.change(screen.getByLabelText('Within-band limit (mm)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Review-band limit (mm)'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))

    expect(screen.getByRole('heading', { name: 'Screening summary' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Within selected screening band' })).toBeInTheDocument()
    expect(screen.queryByText(/Compliant — ready for next layer/i)).not.toBeInTheDocument()
  })

  it('shows an uncovered observation as not assessed instead of a numeric deviation', () => {
    render(<AsBuiltDeviationPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Load fictional training example' }))
    fireEvent.change(screen.getByLabelText('Within-band limit (mm)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Review-band limit (mm)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Observed chainage row 5 (m)'), { target: { value: '81' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))

    expect(screen.getByText(/Incomplete — 1 point\(s\) not assessed/i)).toBeInTheDocument()
    const pointRow = screen.getByText('TRAIN-05').closest('tr')
    expect(pointRow).toHaveTextContent('NOT ASSESSED')
    expect(pointRow).toHaveTextContent('—')
    expect(pointRow).toHaveTextContent(/outside the supplied design profile/i)
  })

  it('imports field CSVs and retains declared control and tolerance provenance in the result', async () => {
    render(<AsBuiltDeviationPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Load fictional training example' }))
    expect(screen.getByText(/EXAMPLE DATA — fictional training values/i)).toBeInTheDocument()
    const designFile = new File(['chainage_m,design_rl_m\n0,100\n20,100.2'], 'design.csv', { type: 'text/csv' })
    Object.defineProperty(designFile, 'text', { value: async () => 'chainage_m,design_rl_m\n0,100\n20,100.2' })
    fireEvent.change(screen.getByLabelText('Import design profile CSV'), { target: { files: [designFile] } })
    expect(await screen.findByRole('status')).toHaveTextContent(/Loaded 2 design station\(s\)/i)
    expect(screen.getByText(/EXAMPLE DATA — fictional training values/i)).toBeInTheDocument()

    const observationsFile = new File(['point_id,chainage_m,observed_rl_m,description\nA,0,100.002,Start\nB,20,100.198,End'], 'observations.csv', { type: 'text/csv' })
    Object.defineProperty(observationsFile, 'text', { value: async () => 'point_id,chainage_m,observed_rl_m,description\nA,0,100.002,Start\nB,20,100.198,End' })
    fireEvent.change(screen.getByLabelText('Import as-built observations CSV'), { target: { files: [observationsFile] } })
    expect(await screen.findByRole('status')).toHaveTextContent(/Loaded 2 observation\(s\)/i)
    expect(screen.queryByText(/EXAMPLE DATA — fictional training values/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Vertical datum and benchmark/control reference'), { target: { value: 'BM-01 · project datum' } })
    fireEvent.change(screen.getByLabelText('Tolerance source or screening note'), { target: { value: 'Drawing C-01 rev 2, clause 5' } })
    fireEvent.change(screen.getByLabelText('Within-band limit (mm)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Review-band limit (mm)'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))

    expect(screen.getByText('BM-01 · project datum')).toBeInTheDocument()
    expect(screen.getByText('Drawing C-01 rev 2, clause 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download screening CSV' })).toBeInTheDocument()
    expect(screen.getByText('2 of 2 entered point(s) are within the selected screening band. This is not a compliance certificate or release for construction.')).toBeInTheDocument()
  })

  it('paginates imported field observations instead of rendering an unbounded results table', async () => {
    render(<AsBuiltDeviationPage />)
    const designText = 'chainage_m,design_rl_m\n0,100\n100,101'
    const designFile = new File([designText], 'design.csv', { type: 'text/csv' })
    Object.defineProperty(designFile, 'text', { value: async () => designText })
    fireEvent.change(screen.getByLabelText('Import design profile CSV'), { target: { files: [designFile] } })
    await screen.findByRole('status')

    const observationText = [
      'point_id,chainage_m,observed_rl_m',
      ...Array.from({ length: 101 }, (_, index) => `P-${String(index + 1).padStart(3, '0')},${index},${(100 + index / 100).toFixed(3)}`),
    ].join('\n')
    const observationsFile = new File([observationText], 'observations.csv', { type: 'text/csv' })
    Object.defineProperty(observationsFile, 'text', { value: async () => observationText })
    fireEvent.change(screen.getByLabelText('Import as-built observations CSV'), { target: { files: [observationsFile] } })
    await screen.findByRole('status')

    fireEvent.change(screen.getByLabelText('Vertical datum and benchmark/control reference'), { target: { value: 'BM-01 · project datum' } })
    fireEvent.change(screen.getByLabelText('Tolerance source or screening note'), { target: { value: 'Preliminary screening only' } })
    fireEvent.change(screen.getByLabelText('Within-band limit (mm)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Review-band limit (mm)'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))

    expect(screen.getByText('Showing 1–100 of 101 observations')).toBeInTheDocument()
    expect(screen.queryByText('P-101')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Showing 101–101 of 101 observations')).toBeInTheDocument()
    expect(screen.getByText('P-101')).toBeInTheDocument()
  })

  it('clears a previous comparison when the observation set changes', () => {
    render(<AsBuiltDeviationPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Load fictional training example' }))
    fireEvent.change(screen.getByLabelText('Within-band limit (mm)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Review-band limit (mm)'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run screening comparison' }))
    expect(screen.getByRole('heading', { name: 'Screening summary' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add observation' }))
    expect(screen.queryByRole('heading', { name: 'Screening summary' })).not.toBeInTheDocument()
  })
})
