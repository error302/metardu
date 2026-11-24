import { fireEvent, render, screen } from '@testing-library/react'
import BeaconCertificateBuilder from '../BeaconCertificateBuilder'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'

// Derived from the declaration authority — never a hardcoded zone literal.
const ARC_1960_37S = horizontalCrsFor('ARC1960', 37, 'S')

function completeFirstBeacon() {
  fireEvent.change(screen.getByLabelText(/Beacon ID \/ Name/), { target: { value: 'P1' } })
  fireEvent.change(screen.getByLabelText('Easting (m)'), { target: { value: '250000' } })
  fireEvent.change(screen.getByLabelText('Northing (m)'), { target: { value: '9945000' } })
}

/**
 * The standalone beacon certificate is a standalone deliverable, so the
 * surveyor selects the coordinate reference explicitly. It is never typed —
 * a typed code is how a certificate ends up claiming the wrong datum.
 */
describe('BeaconCertificateBuilder', () => {
  it('takes the coordinate reference from the CRS picker, never from typed text', () => {
    render(<BeaconCertificateBuilder />)

    expect(screen.getByRole('combobox', { name: 'Coordinate reference' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /coordinate reference/i })).not.toBeInTheDocument()
  })

  it('blocks the export until a registered CRS is selected, then enables it', () => {
    render(<BeaconCertificateBuilder />)
    completeFirstBeacon()

    const print = screen.getByRole('button', { name: /Print draft certificate/i })
    const csv = screen.getByRole('button', { name: /CSV/i })
    expect(print).toBeDisabled()
    expect(csv).toBeDisabled()

    const select = screen.getByRole('combobox', { name: 'Coordinate reference' })
    fireEvent.change(select, { target: { value: ARC_1960_37S } })

    expect(print).toBeEnabled()
    expect(csv).toBeEnabled()
  })

  it('shows the registry-derived reference that will be printed', () => {
    render(<BeaconCertificateBuilder />)
    const select = screen.getByRole('combobox', { name: 'Coordinate reference' })
    fireEvent.change(select, { target: { value: ARC_1960_37S } })

    expect(screen.getByTestId('beacon-crs-print-label').textContent).toContain(
      'Arc 1960 / UTM Zone 37S (EPSG:21037)',
    )
  })

  it('takes the jurisdiction from configuration, not from a hard-coded country', () => {
    render(<BeaconCertificateBuilder />)

    const jurisdiction = screen.getByRole('combobox', { name: 'Jurisdiction' }) as HTMLSelectElement
    expect(jurisdiction.value).not.toBe('')
    expect(Array.from(jurisdiction.options).some((option) => option.value === 'kenya')).toBe(true)
    expect(Array.from(jurisdiction.options).some((option) => option.value === 'bahrain')).toBe(true)
  })
})
