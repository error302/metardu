import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Collection from 'ol/Collection'
import DragPan from 'ol/interaction/DragPan'
import { MapProvider, type MapContextValue } from '../../MapReactContext'
import { MapOverlayProvider } from '../MapOverlayManager'
import { MapInteractionToggle } from '../MapInteractionToggle'

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})

it('allows ordinary pan by default and changes the public interaction state on explicit lock/unlock', async () => {
  const pan = new DragPan()
  const value = { mapReady: true, isMobile: true, mapInstance: { current: { getInteractions: () => new Collection([pan]) } } } as unknown as MapContextValue
  render(<MapProvider value={value}><MapOverlayProvider><MapInteractionToggle mapInstance={value.mapInstance} /></MapOverlayProvider></MapProvider>)
  expect(pan.getActive()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Lock map panning' }))
  await waitFor(() => expect(pan.getActive()).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Enable map panning' }))
  await waitFor(() => expect(pan.getActive()).toBe(true))
})
