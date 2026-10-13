import { fireEvent, render, screen, within } from '@testing-library/react'
import { GCPOptimizerPanel } from '../GCPOptimizerPanel'

const CONCAVE_UTM_BOUNDARY = [
  '257000,9857700',
  '257100,9857700',
  '257100,9857740',
  '257040,9857740',
  '257040,9857800',
  '257000,9857800',
].join('\n')

describe('GCPOptimizerPanel', () => {
  it('plans candidate targets only from an entered UTM boundary and blocks planned-point exports', () => {
    render(<GCPOptimizerPanel />)

    const planButton = screen.getByRole('button', { name: 'Plan candidate targets' })
    expect(planButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Project boundary coordinates'), {
      target: { value: CONCAVE_UTM_BOUNDARY },
    })
    fireEvent.click(planButton)

    expect(screen.getByText('Candidate target locations')).toBeInTheDocument()
    expect(screen.getByText('0.640 ha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pix4D' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'WebODM GCP CSV' })).toBeDisabled()
    expect(screen.getByText(/must be entered below before export/)).toBeInTheDocument()
    expect(screen.queryByText(/Est\. Accuracy|Coverage/)).not.toBeInTheDocument()
  })

  it('announces malformed or self-intersecting boundary input and clears stale output', () => {
    render(<GCPOptimizerPanel />)
    const boundary = screen.getByLabelText('Project boundary coordinates')

    fireEvent.change(boundary, {
      target: { value: ['257000,9857700', '257100,9857800', '257000,9857800', '257100,9857700'].join('\n') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan candidate targets' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/boundary/i)
    expect(screen.queryByText('Candidate target locations')).not.toBeInTheDocument()
  })

  it('unlocks export only after each target has recorded in-boundary measured values and fixed RTK', () => {
    const originalCreateObjectURL = URL.createObjectURL
    const createObjectURL = jest.fn(() => 'blob:gcp-export')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      render(<GCPOptimizerPanel />)
      fireEvent.change(screen.getByLabelText('Project boundary coordinates'), {
        target: { value: CONCAVE_UTM_BOUNDARY },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Plan candidate targets' }))

      const observations = [
        ['GCP-01', '257020', '9857720'],
        ['GCP-02', '257080', '9857720'],
        ['GCP-03', '257080', '9857735'],
        ['GCP-04', '257020', '9857760'],
        ['GCP-05', '257020', '9857790'],
      ]
      for (const [name, easting, northing] of observations) {
        const summary = screen.getByText(`Record measured values for ${name}`)
        const details = summary.closest('details')
        if (!details) throw new Error(`Could not find the survey form for ${name}`)
        fireEvent.click(summary)
        const form = within(details)
        fireEvent.change(form.getByLabelText(`Surveyed easting (m) for ${name}`), { target: { value: easting } })
        fireEvent.change(form.getByLabelText(`Surveyed northing (m) for ${name}`), { target: { value: northing } })
        fireEvent.change(form.getByLabelText(`Surveyed elevation (m) for ${name}`), { target: { value: '0' } })
        fireEvent.change(form.getByLabelText(`Horizontal uncertainty (m) for ${name}`), { target: { value: '0.02' } })
        fireEvent.change(form.getByLabelText(`Vertical uncertainty (m) for ${name}`), { target: { value: '0.03' } })
        fireEvent.click(form.getByLabelText('Receiver reported a fixed RTK solution'))
        fireEvent.click(form.getByRole('button', { name: 'Save measured values' }))
      }

      fireEvent.change(screen.getByLabelText('UTM zone'), { target: { value: '37' } })
      fireEvent.click(screen.getByRole('button', { name: 'Hemisphere South' }))
      const pix4dButton = screen.getByRole('button', { name: 'Pix4D' })
      expect(pix4dButton).toBeEnabled()
      fireEvent.click(pix4dButton)
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(click).toHaveBeenCalled()
    } finally {
      click.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL })
    }
  })

  it('does not save or export a survey record outside the entered project boundary', () => {
    render(<GCPOptimizerPanel />)
    fireEvent.change(screen.getByLabelText('Project boundary coordinates'), {
      target: { value: CONCAVE_UTM_BOUNDARY },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan candidate targets' }))
    const summary = screen.getByText('Record measured values for GCP-01')
    const details = summary.closest('details')
    if (!details) throw new Error('Could not find the survey form for GCP-01')
    fireEvent.click(summary)
    const form = within(details)
    fireEvent.change(form.getByLabelText('Surveyed easting (m) for GCP-01'), { target: { value: '257080' } })
    fireEvent.change(form.getByLabelText('Surveyed northing (m) for GCP-01'), { target: { value: '9857790' } })
    fireEvent.change(form.getByLabelText('Surveyed elevation (m) for GCP-01'), { target: { value: '0' } })
    fireEvent.change(form.getByLabelText('Horizontal uncertainty (m) for GCP-01'), { target: { value: '0.02' } })
    fireEvent.change(form.getByLabelText('Vertical uncertainty (m) for GCP-01'), { target: { value: '0.03' } })
    fireEvent.click(form.getByLabelText('Receiver reported a fixed RTK solution'))
    fireEvent.click(form.getByRole('button', { name: 'Save measured values' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/outside the entered project boundary/)
    expect(screen.getByRole('button', { name: 'Pix4D' })).toBeDisabled()
  })

  it('rejects duplicate surveyed coordinates across control points', () => {
    render(<GCPOptimizerPanel />)
    fireEvent.change(screen.getByLabelText('Project boundary coordinates'), {
      target: { value: CONCAVE_UTM_BOUNDARY },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan candidate targets' }))

    for (const name of ['GCP-01', 'GCP-02']) {
      const summary = screen.getByText(`Record measured values for ${name}`)
      const details = summary.closest('details')
      if (!details) throw new Error(`Could not find the survey form for ${name}`)
      fireEvent.click(summary)
      const form = within(details)
      fireEvent.change(form.getByLabelText(`Surveyed easting (m) for ${name}`), { target: { value: '257020' } })
      fireEvent.change(form.getByLabelText(`Surveyed northing (m) for ${name}`), { target: { value: '9857720' } })
      fireEvent.change(form.getByLabelText(`Surveyed elevation (m) for ${name}`), { target: { value: '0' } })
      fireEvent.change(form.getByLabelText(`Horizontal uncertainty (m) for ${name}`), { target: { value: '0.02' } })
      fireEvent.change(form.getByLabelText(`Vertical uncertainty (m) for ${name}`), { target: { value: '0.03' } })
      fireEvent.click(form.getByLabelText('Receiver reported a fixed RTK solution'))
      fireEvent.click(form.getByRole('button', { name: 'Save measured values' }))
    }

    expect(screen.getByRole('alert')).toHaveTextContent(/duplicate GCP-01/)
    expect(screen.getByRole('button', { name: 'Pix4D' })).toBeDisabled()
  })
})
