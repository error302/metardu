/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { BatchParcelImport } from '../BatchParcelImport'

// RFC 7946 GeoJSON without a legacy crs member is WGS 84 lon/lat, which is the
// prefill the component applies. One synthetic parcel is enough to reach the
// coordinate-system declaration step.
const geojson = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { parcel_number: 'SYN/1' },
    geometry: { type: 'Polygon', coordinates: [[[36.8, -1.3], [36.81, -1.3], [36.81, -1.29], [36.8, -1.29], [36.8, -1.3]]] },
  }],
})

it('declares the parcel source CRS from the registry once a file is parsed', async () => {
  render(<BatchParcelImport projectId="p" onImport={jest.fn()} />)
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([geojson], 'parcels.geojson', { type: 'application/json' })
  // jsdom (jest environment) predates Blob.text(); the component awaits it.
  Object.defineProperty(file, 'text', { value: async () => geojson })
  fireEvent.change(input, { target: { files: [file] } })
  const select = await screen.findByLabelText('Source coordinate system') as HTMLSelectElement
  // The RFC 7946 geographic default must remain selectable as the file's source system.
  expect(select.value).toBe('EPSG:4326')
  // Web Mercator is a picture, not a source grid — never selectable.
  expect(Array.from(select.options).some(option => option.value === 'EPSG:3857')).toBe(false)
  // The prefill comes from the file, and the picker says so.
  expect(screen.getByTestId('parcel-source-crs-provenance')).toHaveTextContent(/file's embedded CRS/i)
})
