import { fireEvent, render, screen } from '@testing-library/react'
import { SpiralAlignmentTab } from '../SpiralAlignmentTab'

it('clears computed/exportable results as soon as source geometry changes', () => {
  render(<SpiralAlignmentTab />)
  fireEvent.click(screen.getByRole('button', { name: 'Compute Alignment' }))
  expect(screen.getByText('Key Stations & Geometry')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Radius R (m)'), { target: { value: '400' } })
  expect(screen.queryByText('Key Stations & Geometry')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument()
})
it('does not reinterpret an empty PI chainage as a measured zero', () => {
  render(<SpiralAlignmentTab />)
  fireEvent.change(screen.getByLabelText('PI chainage (m)'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute Alignment' }))
  expect(screen.getByText(/finite numbers/)).toBeInTheDocument()
  expect(screen.queryByText('Key Stations & Geometry')).not.toBeInTheDocument()
})
it('labels local coordinates and prevents an undeclared geographic export', () => {
  render(<SpiralAlignmentTab />)
  fireEvent.click(screen.getByRole('button', { name: 'Compute Alignment' }))
  expect(screen.getByRole('button', { name: 'GeoJSON' })).toBeDisabled()
  expect(screen.getByText(/Local tangent frame/)).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Local X (m)' })).toBeInTheDocument()
})

it('reports an oversized station schedule without crashing the results view', () => {
  render(<SpiralAlignmentTab />)
  fireEvent.change(screen.getByLabelText('Radius R (m)'), { target: { value: '100000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compute Alignment' }))
  expect(screen.getByText(/larger station interval/)).toBeInTheDocument()
  expect(screen.queryByText('Key Stations & Geometry')).not.toBeInTheDocument()
})
