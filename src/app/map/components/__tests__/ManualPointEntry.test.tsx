import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ManualPointEntry } from '../ManualPointEntry'
import { fromReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'

const crs = 'EPSG:' + 32737
const project = '11111111-1111-4111-8111-111111111111'
const originalFetch = global.fetch
const reply = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body }) as Response

function declaredReference(verticalDatum: string | null) {
  return fromReferenceSystemRow({
    horizontal_crs: crs, horizontal_name: 'Synthetic WGS 84 grid', datum_name: 'WGS84', units: 'metres',
    zone: 37, hemisphere: 'S', distance_mode: 'grid', coordinate_precision: 3, vertical_datum: verticalDatum,
  })
}

afterEach(() => { global.fetch = originalFetch })

test('key-in stores the labelled grid, unknown height, feature code and remarks in the project register', async () => {
  const onSaved = jest.fn()
  const request = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(reply({ referenceSystem: declaredReference(null) }))
    .mockResolvedValueOnce(reply({ data: { point_name: 'CREW-A-024' }, fieldVerified: false }, 201))
  global.fetch = request
  render(<ManualPointEntry projectId={project} onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Key in point' }))
  const dialog = within(await screen.findByRole('dialog'))
  const id = await dialog.findByLabelText('Point ID')
  fireEvent.change(id, { target: { value: 'CREW-A-024' } })
  fireEvent.change(dialog.getByLabelText('Easting (m)'), { target: { value: '500001.2345' } })
  fireEvent.change(dialog.getByLabelText('Northing (m)'), { target: { value: '9850002.3456' } })
  fireEvent.change(dialog.getByLabelText('Feature code'), { target: { value: 'KERB' } })
  fireEvent.change(dialog.getByLabelText('Field remarks'), { target: { value: 'Top of kerb at gate' } })
  expect(dialog.getByLabelText('Height (m)')).toBeDisabled()
  fireEvent.click(dialog.getByRole('button', { name: 'Store point' }))

  expect(await dialog.findByText('CREW-A-024 stored in the project register.')).toBeInTheDocument()
  const [url, options] = request.mock.calls[1]
  expect(url).toBe(`/api/project/${project}/points`)
  expect(JSON.parse(typeof options?.body === 'string' ? options.body : '')).toEqual({
    pointName: 'CREW-A-024', easting: 500001.2345, northing: 9850002.3456, elevation: null, code: 'KERB', description: 'Top of kerb at gate',
    expectedReference: { horizontalCrs: crs, verticalDatum: null },
  })
  expect(onSaved).toHaveBeenCalledTimes(1)
  expect(id).toHaveValue('')
})

test('missing reference blocks manual entry', async () => {
  global.fetch = jest.fn().mockResolvedValue(reply({ referenceSystem: null }))
  render(<ManualPointEntry projectId={project} onSaved={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Key in point' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Declare the project reference system')
  expect(screen.queryByRole('button', { name: 'Store point' })).not.toBeInTheDocument()
})

test('a reference conflict keeps the observation values open and gives no saved receipt', async () => {
  const onSaved = jest.fn()
  global.fetch = jest.fn()
    .mockResolvedValueOnce(reply({ referenceSystem: declaredReference('Synthetic benchmark') }))
    .mockResolvedValueOnce(reply({ error: 'The project reference changed.' }, 409))
  render(<ManualPointEntry projectId={project} onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Key in point' }))
  const id = await screen.findByLabelText('Point ID')
  fireEvent.change(id, { target: { value: 'P01' } })
  fireEvent.change(screen.getByLabelText('Easting (m)'), { target: { value: '500000' } })
  fireEvent.change(screen.getByLabelText('Northing (m)'), { target: { value: '9850000' } })
  fireEvent.change(screen.getByLabelText('Height (m)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Store point' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The project reference changed.')
  await waitFor(() => expect(screen.getByLabelText('Height (m)')).toHaveValue(0))
  expect(id).toHaveValue('P01')
  expect(onSaved).not.toHaveBeenCalled()
})
