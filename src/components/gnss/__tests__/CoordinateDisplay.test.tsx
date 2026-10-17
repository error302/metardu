/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CoordinateDisplay } from '../CoordinateDisplay'
import type { NMEAPosition } from '@/lib/gnss/nmea-parser'

const position: NMEAPosition = {
  latitude: -1.2921,
  longitude: 36.8219,
  altitude: 1650.32,
  hdop: 0.8,
  satellites: 18,
  fixType: 'rtk',
  timestamp: new Date('2026-10-17T08:00:00.000Z'),
  quality: 4,
}

describe('GNSS coordinate display', () => {
  it('shows receiver latitude and longitude without assigning a Kenya project grid', () => {
    const { container } = render(<CoordinateDisplay position={position} />)

    expect(container.textContent).toContain('Receiver latitude / longitude')
    expect(container.textContent).toContain('-1.2921000°')
    expect(container.textContent).toContain('36.8219000°')
    expect(container.textContent).not.toContain('SRID 21037')
    expect(container.textContent).not.toContain('Easting')
  })

  it('copies only the receiver latitude and longitude', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<CoordinateDisplay position={position} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy receiver latitude and longitude' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('-1.2921000, 36.8219000'))
    expect(await screen.findByRole('status')).toHaveTextContent('Coordinates copied.')
  })
})
