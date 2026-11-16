import { fireEvent, render, screen, within } from '@testing-library/react'
import { FeatureCodePicker } from '../FeatureCodePicker'
import { RECENT_FIELD_CODES_KEY } from '@/lib/field/fieldCodePicker'

describe('FeatureCodePicker', () => {
  beforeEach(() => window.localStorage.clear())

  it('offers the job-type codes and reports the CAD layer before capture', () => {
    render(<FeatureCodePicker value="" onChange={jest.fn()} surveyType="cadastral" />)

    expect(screen.getByRole('group', { name: 'Quick feature codes' })).toBeInTheDocument()
    expect(screen.getByText('Uncoded — not sent to a layer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MB — Concrete Beacon, layer BEACONS' })).toBeInTheDocument()
  })

  it('selects a code and explains the layer it will produce', () => {
    const onChange = jest.fn()
    render(<FeatureCodePicker value="" onChange={onChange} surveyType="topographic" />)

    fireEvent.click(screen.getByRole('button', { name: 'BLD — Building, layer BUILDINGS' }))

    expect(onChange).toHaveBeenCalledWith('BLD')
  })

  it('remembers the chosen code so the next capture is one tap', () => {
    render(<FeatureCodePicker value="" onChange={jest.fn()} surveyType="topographic" />)

    fireEvent.click(screen.getByRole('button', { name: 'BLD — Building, layer BUILDINGS' }))

    expect(JSON.parse(window.localStorage.getItem(RECENT_FIELD_CODES_KEY) ?? '[]')).toEqual(['BLD'])
  })

  it('clears the code when the same chip is tapped again so uncoded points stay possible', () => {
    const onChange = jest.fn()
    render(<FeatureCodePicker value="BLD" onChange={onChange} surveyType="topographic" />)

    fireEvent.click(screen.getByRole('button', { name: 'BLD — Building, layer BUILDINGS' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('searches the full table and says so when nothing matches', () => {
    render(<FeatureCodePicker value="" onChange={jest.fn()} surveyType="general" />)

    fireEvent.click(screen.getByRole('button', { name: /All codes/ }))
    const search = screen.getByLabelText('Search by code, name or category')
    const list = screen.getByRole('list', { name: 'Feature codes' })

    fireEvent.change(search, { target: { value: 'fence' } })
    expect(within(list).getByText('FNC')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'zzzznomatch' } })
    expect(screen.getByText(/No code matches/)).toBeInTheDocument()
  })
})
