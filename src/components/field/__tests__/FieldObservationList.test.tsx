import { render, screen } from '@testing-library/react'
import { FieldObservationList } from '../FieldObservationList'
import type { FieldMeasurement } from '@/lib/field/fieldSession'

const measurement: FieldMeasurement = {
  id: 'obs-1',
  timestamp: new Date('2026-11-17T06:00:00Z').getTime(),
  pointId: 'BP4',
  stationFrom: '',
  easting: 258144.33,
  northing: 9857660.12,
  horizontalCrs: 'EPSG:21037',
  instrumentType: 'gnss_rover',
  mode: 'traverse',
  notes: 'QC=RTK_FIXED; CODE=FNC; METARDU_POINT_ID=BP4',
  synced: true,
}

describe('FieldObservationList', () => {
  it('shows captured code and quality as survey language instead of raw tokens', () => {
    render(<FieldObservationList measurements={[measurement]} />)
    expect(screen.getByText('Capture quality: RTK Fixed')).toBeInTheDocument()
    expect(screen.getByText(/Code:/)).toBeInTheDocument()
    expect(screen.getByText(/Fence Line → layer FENCE/)).toBeInTheDocument()
    expect(screen.queryByText(/CODE=FNC/)).not.toBeInTheDocument()
    expect(screen.queryByText(/QC=RTK_FIXED/)).not.toBeInTheDocument()
  })
})
