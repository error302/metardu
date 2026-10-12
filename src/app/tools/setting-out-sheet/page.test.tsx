import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingOutSheetPage from './page'

describe('general setting-out sheet page', () => {
  const originalFetch = global.fetch
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  const originalAnchorClick = HTMLAnchorElement.prototype.click

  beforeEach(() => {
    global.fetch = jest.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:setting-out-test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })
    HTMLAnchorElement.prototype.click = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl })
    HTMLAnchorElement.prototype.click = originalAnchorClick
    jest.clearAllMocks()
  })

  it('validates the pasted point list before sending and generating a PDF', () => {
    render(<SettingOutSheetPage />)
    fireEvent.change(screen.getByLabelText('CSV / TSV point rows'), { target: { value: 'P-01,500010,' } })

    expect(screen.getByRole('alert')).toHaveTextContent(/northing must be a finite decimal number/i)
    expect(screen.getByRole('button', { name: 'Generate draft PDF' })).toBeDisabled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sends supplied data to the private PDF endpoint and reports the downloaded draft', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF-1.7 synthetic test content'], { type: 'application/pdf' }),
    })
    render(<SettingOutSheetPage />)

    fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'Access Road' } })
    fireEvent.change(screen.getByLabelText('Sheet date'), { target: { value: '2026-10-12' } })
    fireEvent.change(screen.getByLabelText(/Surveyor name/), { target: { value: 'Surveyor Example' } })
    fireEvent.change(screen.getByLabelText(/Registration \/ licence/), { target: { value: 'LS-123' } })
    fireEvent.change(screen.getByLabelText(/Declared project CRS/), { target: { value: 'EPSG:32737' } })
    fireEvent.change(screen.getByLabelText('CSV / TSV point rows'), { target: { value: 'P-01,500010,9900000,,,0.1,0.2,,Foundation corner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft PDF' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/documents/setting-out-sheet')
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toMatchObject({
      projection: 'EPSG:32737',
      points: [{ pointId: 'P-01', designE: 500010, designN: 9900000, offsetE: 0.1, offsetN: 0.2 }],
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/draft pdf downloaded with 1 supplied point/i)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })
})
