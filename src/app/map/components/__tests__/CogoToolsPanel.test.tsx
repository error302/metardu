import { fireEvent, render, screen } from '@testing-library/react'
import { CogoToolsPanel } from '../CogoToolsPanel'
const mockSurveyCrs = 'EPSG:32737'

jest.mock('@/app/map/MapReactContext', () => ({
  useMapContext: () => ({ mapInstance: { current: null }, currentSurveyCrs: mockSurveyCrs, setSaveMsg: jest.fn() }),
}))

it('makes angle notation explicit and clears prior results when notation changes', () => {
  render(<CogoToolsPanel />)
  fireEvent.change(screen.getByLabelText('E'), { target: { value: '1000' } })
  fireEvent.change(screen.getByLabelText('N'), { target: { value: '2000' } })
  fireEvent.change(screen.getByLabelText('Brg'), { target: { value: '47.2314' } })
  fireEvent.change(screen.getByLabelText('Dist'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }))
  expect(screen.getByText('Computed Point')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Angle format' }), { target: { value: 'packed-dms' } })
  expect(screen.queryByText('Computed Point')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Brg')).toHaveValue('')
})

it('rejects partial coordinate text instead of silently using the numeric prefix', () => {
  render(<CogoToolsPanel />)
  fireEvent.change(screen.getByLabelText('E'), { target: { value: '1000oops' } })
  fireEvent.change(screen.getByLabelText('N'), { target: { value: '2000' } })
  fireEvent.change(screen.getByLabelText('Brg'), { target: { value: '90' } })
  fireEvent.change(screen.getByLabelText('Dist'), { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: /^Compute$/ }))
  expect(screen.getByText('Invalid station coordinates')).toBeInTheDocument()
  expect(screen.queryByText('Computed Point')).not.toBeInTheDocument()
})
