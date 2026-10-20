/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DynamicFieldBook from '@/components/workspace/DynamicFieldBook'

const originalFetch = global.fetch
const crs = 'EPSG:' + (32700 + 37)
afterEach(() => { global.fetch = originalFetch })

function setup(startPoint: unknown = null) {
  const fetchMock = jest.fn().mockImplementation(async (_url: unknown, options?: RequestInit) => ({
    ok: true, json: async () => options?.method === 'PUT' ? { saved: true, revision: 'b'.repeat(64) } : {
      revision: 'a'.repeat(64), projectCrs: crs, startPoint,
      data: [{ station: 'A1', raw_data: { station: 'A1', target: 'A2', bearing: '0', distance: '80', distanceType: 'grid', source: 'preserved' } }],
    },
  }))
  global.fetch = fetchMock
  render(<DynamicFieldBook projectId="control-save" surveyType="cadastral" />)
  return fetchMock
}

test('row and starting-coordinate edits require explicit save and are sent in one revision-bound snapshot', async () => {
  const fetchMock = setup()
  fireEvent.change(await screen.findByLabelText('Distance (m)'), { target: { value: '81' } })
  fireEvent.change(screen.getByLabelText('Starting station name'), { target: { value: 'A1' } })
  fireEvent.change(screen.getByLabelText('Control easting (m)'), { target: { value: '500001' } })
  fireEvent.change(screen.getByLabelText('Control northing (m)'), { target: { value: '9900000' } })
  fireEvent.change(screen.getByLabelText('Starting coordinate source / limitations'), { target: { value: 'SIMULATION, not measured control' } })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('link', { name: 'Compute saved traverse' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Save the field book/)
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Confirm/)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('checkbox', { name: /confirm this starting coordinate/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const options = (fetchMock.mock.calls as [unknown, RequestInit][])[1][1]
  const body: unknown = JSON.parse(String(options.body))
  expect(body).toMatchObject({ revision: 'a'.repeat(64), startPoint: { name: 'A1', easting: 500001, northing: 9900000, crs, notes: 'SIMULATION, not measured control' }, rows: [{ distance: '81', source: 'preserved' }] })
  expect(await screen.findByText(/^Saved /)).toBeInTheDocument()
})

test('unchanged control metadata is omitted from a row-only save so the API preserves it', async () => {
  const fetchMock = setup({ name: 'A1', easting: 500001, northing: 9900000, crs, notes: 'Retained evidence', legacy_metadata: { retain: true } })
  expect(await screen.findByDisplayValue('Retained evidence')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Distance (m)'), { target: { value: '81' } })
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const options = (fetchMock.mock.calls as [unknown, RequestInit][])[1][1]
  const body: unknown = JSON.parse(String(options.body))
  expect(body).not.toHaveProperty('startPoint')
})
