import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import StakeoutReportPage from './page'

jest.mock('@/components/shared/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }))

describe('stakeout report entry and review', () => {
  it('starts empty and cannot export invented observations or survey identities', () => {
    render(<StakeoutReportPage />)
    expect(screen.getByPlaceholderText('Project Name')).toHaveValue('')
    expect(screen.getByPlaceholderText('Surveyor Name')).toHaveValue('')
    expect(screen.getByLabelText('Projected metre CRS')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Print Cut Sheet' })).toBeDisabled()
    expect(screen.queryByDisplayValue('SRB/LS/2026/0289')).not.toBeInTheDocument()
  })

  it('keeps a cleared measured coordinate blank and blocks a stale report export', () => {
    render(<StakeoutReportPage />)
    fireEvent.change(screen.getByLabelText('Example data selection'), { target: { value: 'column_grid' } })
    const measured = screen.getByLabelText('COL-A1 staked.easting')
    fireEvent.change(measured, { target: { value: '' } })
    expect(measured).toHaveValue(null)
    expect(screen.getByRole('alert')).toHaveTextContent(/finite/i)
    expect(screen.getByRole('button', { name: 'Download HTML Report' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/synthetic/i)
  })

  it('shows an unassessed level result after clearing an observed RL', () => {
    render(<StakeoutReportPage />)
    fireEvent.change(screen.getByLabelText('Example data selection'), { target: { value: 'column_grid' } })
    fireEvent.change(screen.getByLabelText('COL-A1 staked.elevation'), { target: { value: '' } })
    expect(screen.getAllByText('NOT ASSESSED')).toHaveLength(1)
    expect(screen.getByText(/1 not assessed/)).toBeInTheDocument()
  })

  it('preserves existing observations after rejecting a malformed CSV', async () => {
    render(<StakeoutReportPage />)
    fireEvent.change(screen.getByLabelText('Example data selection'), { target: { value: 'column_grid' } })
    const file = new File(['id,e,n\nP1,wrong,2'], 'invalid.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Import stakeout CSV'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/columns/i))
    expect(screen.getByLabelText('COL-A1 staked.easting')).toHaveValue(275100.008)
    expect(screen.getByRole('status')).toHaveTextContent(/synthetic/i)
  })
})
