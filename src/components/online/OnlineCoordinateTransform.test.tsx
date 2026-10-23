/* eslint-disable no-restricted-syntax -- Explicit CRS fixtures exercise operator selections, not project/map CRS defaults. */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import OnlineCoordinateTransform from './OnlineCoordinateTransform'
import { transformOnlineCoordinates, type TransformResult } from '@/lib/online/coordinates'

jest.mock('@/lib/online/coordinates', () => ({
  ...jest.requireActual<typeof import('@/lib/online/coordinates')>('@/lib/online/coordinates'),
  transformOnlineCoordinates: jest.fn(),
}))

const geographic = {
  code: 'EPSG:4326', id: 'EPSG:4326', name: 'WGS 84 (geographic 2D)',
  units: 'degrees', datum: 'WGS 84', projected: false,
  type: 'geographic', axisConvention: 'longitude,latitude',
} as const
const projected = {
  code: 'EPSG:21037', id: 'EPSG:21037', name: 'Arc 1960 / UTM zone 37S',
  units: 'metres', datum: 'Arc 1960', projected: true, zone: 37, hemisphere: 'S',
  type: 'projected', axisConvention: 'easting,northing',
} as const
const zeroResult: Extract<TransformResult, { success: true }> = {
  success: true, fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326',
  result: { longitude: 0, latitude: 0 },
  source: geographic, target: geographic,
  operation: {
    engine: 'proj4', authority: 'METARDU shared CRS authority', kind: 'identity',
    sourceDefinition: '+proj=longlat +datum=WGS84 +no_defs',
    targetDefinition: '+proj=longlat +datum=WGS84 +no_defs',
    accuracyMetres: null, accuracyStatus: 'not-established', applicabilityStatus: 'not-verified',
    horizontalOnly: true, verticalTreatment: 'preserved-untransformed',
    notes: ['Elevation is preserved unchanged; no vertical datum transformation is performed.'],
  },
  notes: ['Elevation is preserved unchanged; no vertical datum transformation is performed.'],
}

function mountForm() {
  return render(<OnlineCoordinateTransform />)
}
function edit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function ready() {
  edit('Target CRS', 'EPSG:4326')
  edit('Longitude (degrees)', '0')
  edit('Latitude (degrees)', '0')
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Transform Coordinates' })) }
function deferred() {
  let resolve!: (value: TransformResult) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<TransformResult>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  jest.mocked(transformOnlineCoordinates).mockReset().mockResolvedValue(zeroResult)
})

test('reference choices disclose code, datum, units and axes without inferring a target', () => {
  mountForm()
  expect(screen.getByLabelText('Source CRS')).toHaveValue('EPSG:4326')
  expect(screen.getByLabelText('Target CRS')).toHaveValue('')
  expect(screen.getByRole('status')).toHaveTextContent(/choose a target/i)
  expect(screen.getByRole('button', { name: 'Transform Coordinates' })).toBeDisabled()
  const source = screen.getByRole('region', { name: 'Source reference' })
  expect(source).toHaveTextContent('EPSG:4326')
  expect(source).toHaveTextContent('degrees')
  expect(source).toHaveTextContent('longitude,latitude')
  edit('Target CRS', 'EPSG:32760')
  expect(screen.getByRole('region', { name: 'Target reference' })).toHaveTextContent('60S')
  expect(screen.queryByRole('option', { name: /3857/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Adindan, Cape, ED50/)).toBeInTheDocument()
})

test('blank horizontal measurements never become zero and validation clears on an edit', async () => {
  mountForm()
  edit('Target CRS', 'EPSG:4326')
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(/finite|enter/i)
  expect(transformOnlineCoordinates).not.toHaveBeenCalled()
  edit('Longitude (degrees)', '0')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test.each(['12junk', 'Infinity', 'NaN', '1e999'])('rejects nonfinite or partially numeric text %s', async value => {
  mountForm()
  ready()
  edit('Longitude (degrees)', value)
  submit()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(transformOnlineCoordinates).not.toHaveBeenCalled()
})

test('strict numeric conversion keeps zeros and fractions, omits blank height and shows honest evidence', async () => {
  jest.mocked(transformOnlineCoordinates).mockResolvedValue({ ...zeroResult, result: { longitude: 0, latitude: -1.25 } })
  mountForm()
  ready()
  edit('Latitude (degrees)', ' -1.25 ')
  submit()
  expect(await screen.findByText('Transformation successful')).toBeInTheDocument()
  expect(transformOnlineCoordinates).toHaveBeenCalledWith({ fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', longitude: 0, latitude: -1.25 })
  const result = screen.getByRole('region', { name: 'Transformation result' })
  expect(result).toHaveTextContent('Longitude: 0.000000 degrees')
  expect(result).toHaveTextContent('Latitude: -1.250000 degrees')
  expect(within(result).queryByText(/^Elevation:/)).not.toBeInTheDocument()
  expect(result).toHaveTextContent(/accuracy: unknown/i)
  expect(result).toHaveTextContent(/applicability: not verified/i)
  expect(result).toHaveTextContent('identity')
  expect(result).toHaveTextContent('proj4')
  expect(result).toHaveTextContent('+proj=longlat +datum=WGS84 +no_defs')
  expect(result).toHaveTextContent(/display resolution/i)
  expect(result).toHaveTextContent(/no vertical datum transformation/i)
  expect(within(result).queryByText(/^Easting:/)).not.toBeInTheDocument()
  expect(result).not.toHaveTextContent(/0\.001 m precision|exact accuracy/i)
})

test('an optional zero height remains explicit without invented height units', async () => {
  jest.mocked(transformOnlineCoordinates).mockResolvedValue({ ...zeroResult, result: { longitude: 0, latitude: 0, elevation: 0 } })
  mountForm()
  ready()
  edit('Elevation (optional, unchanged)', '0')
  submit()
  await screen.findByText('Transformation successful')
  expect(transformOnlineCoordinates).toHaveBeenCalledWith({ fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', longitude: 0, latitude: 0, elevation: 0 })
  const result = screen.getByRole('region', { name: 'Transformation result' })
  expect(result).toHaveTextContent('Latitude: 0.000000 degrees')
  expect(result).toHaveTextContent('Elevation: 0 (unchanged)')
  expect(screen.getByLabelText('Elevation (optional, unchanged)')).not.toHaveAccessibleName(/metres|\(m\)/i)
})

test('switching source type clears incompatible measurements and submits only the named projected pair', async () => {
  mountForm()
  ready()
  edit('Source CRS', 'EPSG:32637')
  expect(screen.queryByLabelText('Longitude (degrees)')).not.toBeInTheDocument()
  edit('Easting (m)', '500000')
  edit('Northing (m)', '0')
  edit('Source CRS', 'EPSG:4326')
  expect(screen.getByLabelText('Longitude (degrees)')).toHaveValue('')
  expect(screen.getByLabelText('Latitude (degrees)')).toHaveValue('')
  edit('Source CRS', 'EPSG:32637')
  expect(screen.getByLabelText('Easting (m)')).toHaveValue('')
  expect(screen.getByLabelText('Northing (m)')).toHaveValue('')
  edit('Easting (m)', '500000')
  edit('Northing (m)', '0')
  submit()
  await screen.findByText('Transformation successful')
  expect(transformOnlineCoordinates).toHaveBeenCalledWith({ fromCRS: 'EPSG:32637', toCRS: 'EPSG:4326', easting: 500000, northing: 0 })
})

test('projected targets render the target pair including zero and configured regional caveats', async () => {
  jest.mocked(transformOnlineCoordinates).mockResolvedValue({ ...zeroResult,
    toCRS: 'EPSG:21037', target: projected, result: { easting: 500000, northing: 0, elevation: null },
    operation: { ...zeroResult.operation, kind: 'configured-datum-transform', targetDefinition: '+proj=utm +zone=37 +south +ellps=clrk80 +towgs84=-160,-6,-302 +units=m +no_defs' },
    notes: ['Arc 1960 uses the configured -160, -6, -302 metre translation. Verify regional applicability against independent control before survey use.'],
  })
  mountForm()
  ready()
  edit('Target CRS', 'EPSG:21037')
  submit()
  await screen.findByText('Transformation successful')
  const result = screen.getByRole('region', { name: 'Transformation result' })
  expect(result).toHaveTextContent('Easting: 500000.000 m')
  expect(result).toHaveTextContent('Northing: 0.000 m')
  expect(result).toHaveTextContent('EPSG:21037')
  expect(result).toHaveTextContent('easting,northing')
  expect(result).toHaveTextContent('configured-datum-transform')
  expect(result).toHaveTextContent(/Elevation: not supplied \(null\)/)
  expect(result).toHaveTextContent(/Arc 1960.*-160, -6, -302/)
  expect(within(result).queryByText(/^Latitude:/)).not.toBeInTheDocument()
})

test.each([
  ['Longitude (degrees)', '1'], ['Latitude (degrees)', '1'],
  ['Elevation (optional, unchanged)', '0'], ['Source CRS', 'EPSG:32637'], ['Target CRS', 'EPSG:32737'],
])('editing %s immediately removes the old result', async (label, value) => {
  mountForm()
  ready()
  submit()
  await screen.findByText('Transformation successful')
  edit(label, value)
  expect(screen.queryByRole('region', { name: 'Transformation result' })).not.toBeInTheDocument()
  expect(screen.queryByText('Transformation successful')).not.toBeInTheDocument()
})

test.each(['Easting (m)', 'Northing (m)'])('editing %s removes a completed projected-source result', async label => {
  mountForm()
  ready()
  edit('Source CRS', 'EPSG:32637')
  edit('Easting (m)', '500000')
  edit('Northing (m)', '0')
  submit()
  await screen.findByText('Transformation successful')
  edit(label, '1')
  expect(screen.queryByText('Transformation successful')).not.toBeInTheDocument()
})

test.each(['success', 'failure', 'rejection'])('edited pending %s is discarded and its lock releases for a new calculation', async settlement => {
  const pending = deferred()
  jest.mocked(transformOnlineCoordinates).mockReturnValueOnce(pending.promise)
  mountForm()
  ready()
  submit()
  expect(screen.getByRole('status')).toHaveTextContent(/transforming/i)
  edit('Longitude (degrees)', '1')
  expect(screen.getByLabelText('Longitude (degrees)')).toBeEnabled()
  expect(screen.getByRole('status')).toHaveTextContent(/pending result will be discarded/i)
  expect(screen.getByRole('button', { name: /transforming/i })).toBeDisabled()
  await act(async () => {
    if (settlement === 'rejection') pending.reject(new Error('Obsolete error'))
    else pending.resolve(settlement === 'success' ? zeroResult : { success: false, code: 'OPERATION_UNAVAILABLE', error: 'Obsolete unavailable operation' })
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText('Transformation successful')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Transform Coordinates' })).toBeEnabled()
  submit()
  await screen.findByText('Transformation successful')
  expect(transformOnlineCoordinates).toHaveBeenLastCalledWith({ fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', longitude: 1, latitude: 0 })
})

test('duplicate submissions share one pending owner even before a render', async () => {
  const pending = deferred()
  jest.mocked(transformOnlineCoordinates).mockReturnValueOnce(pending.promise)
  mountForm()
  ready()
  const form = screen.getByRole('form', { name: 'Coordinate transformation' })
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(transformOnlineCoordinates).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve(zeroResult))
  expect(screen.getByText('Transformation successful')).toBeInTheDocument()
})

test.each(['semantic', 'rejection'])('current %s failure is accessible, carries no old result and clears on reference edit', async failure => {
  if (failure === 'semantic') jest.mocked(transformOnlineCoordinates).mockResolvedValue({ success: false, code: 'OPERATION_UNAVAILABLE', error: 'No reviewed operation is available.' })
  else jest.mocked(transformOnlineCoordinates).mockRejectedValue(new Error('Network failure'))
  mountForm()
  ready()
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'semantic' ? 'OPERATION_UNAVAILABLE' : 'TRANSFORM_FAILED')
  expect(screen.getByRole('status')).toHaveTextContent(/calculation failed/i)
  expect(screen.queryByRole('region', { name: 'Transformation result' })).not.toBeInTheDocument()
  edit('Target CRS', 'EPSG:32637')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test.each(['success', 'rejection'])('unmount suppresses a late %s without affecting a new instance', async settlement => {
  const pending = deferred()
  jest.mocked(transformOnlineCoordinates).mockReturnValueOnce(pending.promise)
  const old = mountForm()
  ready()
  submit()
  old.unmount()
  mountForm()
  await act(async () => settlement === 'success' ? pending.resolve(zeroResult) : pending.reject(new Error('Late error')))
  expect(screen.getByLabelText('Target CRS')).toHaveValue('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText('Transformation successful')).not.toBeInTheDocument()
})
