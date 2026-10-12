import { fireEvent, render, screen } from '@testing-library/react'
import ParcelSearchPage from './page'

const originalFetch = global.fetch

describe('parcel records page', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    if (originalFetch) Object.defineProperty(global, 'fetch', { configurable: true, writable: true, value: originalFetch })
    else Reflect.deleteProperty(global, 'fetch')
  })

  it('identifies local-only records and links directly to the official portal', () => {
    render(<ParcelSearchPage />)

    expect(screen.getByText(/METARDU is not connected to live government registry search/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open the official Ardhisasa portal/i })).toHaveAttribute(
      'href',
      'https://ardhisasa.lands.go.ke/home',
    )
    expect(screen.queryByText(/NLIMS_API_KEY|live NLIMS API/i)).not.toBeInTheDocument()
  })

  it('shows that a local miss is not an official registry not-found result', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        found: false,
        code: 'OFFICIAL_REGISTRY_ACCESS_UNAVAILABLE',
        error: 'No matching record is available in METARDU records. Live government registry search is not connected; this does not mean the parcel is absent from the official register.',
      }),
    } as Response)
    Object.defineProperty(global, 'fetch', { configurable: true, writable: true, value: mockFetch })
    render(<ParcelSearchPage />)
    fireEvent.change(screen.getByLabelText('Parcel Number'), { target: { value: 'NRM/123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search METARDU records' }))

    expect(await screen.findByText(/does not mean the parcel is absent from the official register/i)).toBeInTheDocument()
  })
})
