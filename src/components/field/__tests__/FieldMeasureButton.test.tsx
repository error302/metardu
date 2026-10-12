import { fireEvent, render, screen } from '@testing-library/react'
import { FieldMeasureButton } from '../FieldMeasureButton'
import { useInstrumentStore } from '@/stores/instrumentStore'

describe('FieldMeasureButton point sequence', () => {
  beforeEach(() => {
    const store = useInstrumentStore.getState()
    store.clearPoints()
    store.setStatus('streaming')
    store.addPoint({
      id: 'test-reading',
      pointName: 'TEST-01',
      latitude: -1.2864,
      longitude: 36.8172,
      northing: 9857660.12,
      easting: 258144.33,
      elevation: 1684.2,
      timestamp: new Date('2026-10-12T08:00:00.000Z'),
      source: 'nmea',
    })
  })

  it('moves to the resumed next point number after saved measurements load', () => {
    const props = {
      onCapture: jest.fn().mockResolvedValue(true),
      stationSetup: true,
      pointIdPrefix: 'RD',
      nextPointNumber: 1,
    }
    const view = render(<FieldMeasureButton {...props} />)
    expect(screen.getByLabelText('Measure point RD1')).toBeInTheDocument()

    view.rerender(<FieldMeasureButton {...props} nextPointNumber={8} />)

    expect(screen.getByLabelText('Measure point RD8')).toBeInTheDocument()
  })

  it('keeps a surveyor-selected point number when the saved sequence refreshes', () => {
    const props = {
      onCapture: jest.fn().mockResolvedValue(true),
      stationSetup: true,
      pointIdPrefix: 'RD',
      nextPointNumber: 1,
    }
    const view = render(<FieldMeasureButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByLabelText('Measure point RD2')).toBeInTheDocument()

    view.rerender(<FieldMeasureButton {...props} nextPointNumber={8} />)

    expect(screen.getByLabelText('Measure point RD2')).toBeInTheDocument()
  })
})
