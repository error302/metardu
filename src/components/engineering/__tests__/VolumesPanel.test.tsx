import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import * as compute from '@/lib/engineering/compute'
import { VolumesPanel } from '../VolumesPanel'

jest.spyOn(compute, 'logEngineeringCompute').mockResolvedValue(undefined)

describe('volume calculation input and mass haul', () => {
  it('requires actual section input before showing quantities', () => {
    render(<VolumesPanel />)
    expect(screen.queryByText('Total Cut')).not.toBeInTheDocument()
    expect(screen.queryByText('Net Volume')).not.toBeInTheDocument()
  })

  it('builds the mass-haul chart from computed cubic-metre increments', () => {
    const spy = jest.spyOn(compute, 'massHaulDiagram')
    render(<VolumesPanel />)
    fireEvent.change(screen.getByLabelText('Cross-section areas (m²)'), { target: { value: '10\n10\n10' } })
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'end-area' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate volumes' }))
    expect(spy).toHaveBeenLastCalledWith({ cumulativeVolumes: [0, 200, 200], stationInterval: 20, stations: [0, 20, 40] })
    expect(screen.getByLabelText('Total cut volume')).toHaveTextContent('400.00 m³')
    expect(screen.getByRole('table')).toHaveTextContent('400.00')
    spy.mockRestore()
  })

  it('rejects blanks and numeric suffixes instead of inventing zero areas', () => {
    render(<VolumesPanel />)
    fireEvent.change(screen.getByLabelText('Cross-section areas (m²)'), { target: { value: '10,,20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate volumes' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Section 2')
    expect(screen.queryByText('Total Cut')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cross-section areas (m²)'), { target: { value: '10\n20m2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate volumes' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Section 2')
  })

  it('clears stale results when an input is edited and preserves valid zero areas', () => {
    render(<VolumesPanel />)
    const input = screen.getByLabelText('Cross-section areas (m²)')
    fireEvent.change(input, { target: { value: '0\n10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate volumes' }))
    expect(screen.getByLabelText('Total cut volume')).toHaveTextContent('100.00 m³')
    fireEvent.change(input, { target: { value: '10\n10' } })
    expect(screen.queryByText('Total Cut')).not.toBeInTheDocument()
  })

  it('keeps every section visible in the volume table', () => {
    render(<VolumesPanel />)
    fireEvent.change(screen.getByLabelText('Cross-section areas (m²)'), { target: { value: Array(18).fill('10').join('\n') } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate volumes' }))
    expect(screen.getAllByRole('row')).toHaveLength(19)
    expect(screen.getByRole('table')).toHaveTextContent('Midsection')
  })
})
