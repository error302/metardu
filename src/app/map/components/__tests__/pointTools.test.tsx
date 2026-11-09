import { fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { IdentifyPanel } from '../IdentifyPanel'
import { SnappingOptions } from '../SnappingOptions'

test('the point inspector retains a recorded zero height, grid, code, and field remarks', () => {
  const close = jest.fn()
  render(<IdentifyPanel feature={{
    type: 'point', id: 'point', beaconNumber: 'CREW-A-024', horizontalCrs: 'EPSG:' + 32737,
    easting: 500001, northing: 9850002, elevation: 0, code: 'KERB', description: 'Top of kerb at gate',
  }} onClose={close} />)
  const panel = within(screen.getByRole('region', { name: 'Identify feature' }))
  expect(panel.getByText('CREW-A-024')).toBeInTheDocument()
  expect(panel.getByText('0.000 m')).toBeInTheDocument()
  expect(panel.getByText('EPSG:' + 32737)).toBeInTheDocument()
  expect(panel.getByText('KERB')).toBeInTheDocument()
  expect(panel.getByText('Top of kerb at gate')).toBeInTheDocument()
  fireEvent.click(panel.getByRole('button', { name: 'Close feature details' }))
  expect(close).toHaveBeenCalledTimes(1)
})

test('snapping settings dispatch a mode, tolerance, and enabled change separately', () => {
  const onToggleEnabled = jest.fn(), onModeChange = jest.fn(), onToleranceChange = jest.fn(), onClose = jest.fn(), onSnapTypeToggle = jest.fn()
  render(<StrictMode><SnappingOptions open enabled onClose={onClose} onToggleEnabled={onToggleEnabled}
    onModeChange={onModeChange} onToleranceChange={onToleranceChange} onSnapTypeToggle={onSnapTypeToggle} /></StrictMode>)
  const panel = within(screen.getByRole('region', { name: 'Snapping settings' }))
  fireEvent.click(panel.getByRole('button', { name: 'Vertex' }))
  fireEvent.change(panel.getByRole('slider'), { target: { value: '12' } })
  fireEvent.click(panel.getByRole('checkbox', { name: 'Snap to Drawn features' }))
  fireEvent.click(panel.getByRole('button', { name: 'Enable Snapping' }))
  fireEvent.click(panel.getByRole('button', { name: 'Close snapping settings' }))
  expect(onModeChange).toHaveBeenCalledWith('vertex')
  expect(onToleranceChange).toHaveBeenCalledWith(12)
  expect(onToggleEnabled).toHaveBeenCalledTimes(1)
  expect(onSnapTypeToggle).toHaveBeenCalledTimes(1)
  expect(onSnapTypeToggle).toHaveBeenCalledWith('drawn')
  expect(onClose).toHaveBeenCalledTimes(1)
})
