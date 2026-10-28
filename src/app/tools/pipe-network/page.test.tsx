import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PipeNetworkPage from './page'

// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs21037 = 'EPSG:21037'


jest.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => null }))

describe('pipe network flow screening', () => {
  it('shows near-crown free-surface flow separately from pressure-flow review', () => {
    render(<PipeNetworkPage />)

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'subdivision_main' } })
    const designFlowInputs = screen.getAllByLabelText(/Design flow \(L\/s\)/i)
    expect(designFlowInputs.length).toBeGreaterThan(0)

    fireEvent.change(designFlowInputs[0], { target: { value: '100' } })
    expect(screen.getByText(/Above full-bore rate; near-crown free-surface flow/i)).toBeInTheDocument()
    expect(screen.queryByText('Not solved under pressure')).not.toBeInTheDocument()

    fireEvent.change(designFlowInputs[0], { target: { value: '110' } })
    expect(screen.getByText(/Exceeds open-channel capacity; pressure-flow analysis required/i)).toBeInTheDocument()
    expect(screen.getAllByText('Not solved under pressure').length).toBeGreaterThan(0)
    expect(screen.getByText('Not assessed; pressure flow')).toBeInTheDocument()
  })

  it('uses entered route bends for plan length and blocks malformed coordinates', () => {
    const { container } = render(<PipeNetworkPage />)
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'subdivision_main' } })

    const routeInput = screen.getByLabelText('Intermediate plan bends for P-1')
    fireEvent.change(routeInput, { target: { value: '1030,5025' } })
    expect(screen.getByText('Plan length: 78.1m')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Plan View/i }))
    const routeLine = [...container.querySelectorAll('polyline[stroke="#06b6d4"]')]
      .find(polyline => polyline.getAttribute('points')?.split(' ').length === 3)
    expect(routeLine).toBeDefined()

    fireEvent.change(screen.getByLabelText('Intermediate plan bends for P-1'), { target: { value: 'not coordinates' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/Line 1: enter Easting,Northing/i)
  })

  it('loads and saves the standalone network against the linked project', async () => {
    const originalFetch = global.fetch
    const network = {
      version: 1 as const,
      projectCrs: fixtureCrs21037,
      minimumCoverM: 1.2,
      stationIntervalM: 5,
      manholes: [{ id: 'MH-01', easting: 500000, northing: 9800000, groundLevel: 100, invertOut: 98 }],
      pipes: [],
    }
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ projectName: 'Drainage A', declaredProjectCrs: fixtureCrs21037, network }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true, network }) })
    global.fetch = fetchMock as unknown as typeof fetch
    window.history.pushState({}, '', '/tools/pipe-network?projectId=project-1')

    try {
      render(<PipeNetworkPage />)
      expect(await screen.findByText(/Saved network loaded/i)).toBeInTheDocument()
      const saveButton = await screen.findByRole('button', { name: 'Save changes to project' })
      fireEvent.click(saveButton)

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/project/project-1/pipe-network', expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network }),
      }))
      expect(await screen.findByText(/Network saved to the project/i)).toBeInTheDocument()
    } finally {
      global.fetch = originalFetch
      window.history.pushState({}, '', '/tools/pipe-network')
    }
  })
})
