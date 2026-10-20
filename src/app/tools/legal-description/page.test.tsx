import { fireEvent, render, screen } from '@testing-library/react'
import LegalDescriptionPage from './page'

describe('boundary description draft workflow', () => {
  it('starts empty without a fabricated licence or exportable boundary', () => {
    render(<LegalDescriptionPage />)
    expect(screen.getByRole('heading', { name: 'Boundary Description Draft' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('SRB/LS/2026/0142')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Download Formatted Word/ })).toBeDisabled()
  })

  it('keeps opted-in examples synthetic and blocks export after a coordinate is cleared', () => {
    render(<LegalDescriptionPage />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kajiado_subdivision' } })
    const download = screen.getByRole('button', { name: /Download Formatted Word/ })
    expect(download).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(download).toBeEnabled()
    expect(screen.getByText(/SYNTHETIC EXAMPLE — NOT FIELD EVIDENCE/)).toBeInTheDocument()
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '' } })
    expect(download).toBeDisabled()
    expect(screen.getByText(/Please enter at least 3 beacons/)).toBeInTheDocument()
  })
})
