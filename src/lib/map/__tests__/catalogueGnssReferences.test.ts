import { nearestKenCORSStations } from '../kencors'
const syntheticGrid = 'EPSG:21037'
const differentGrid = 'EPSG:32737'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function response(beacons: unknown[]) {
  const result = new Response(JSON.stringify({ data: { beacons } }))
  Object.defineProperty(result, 'ok', { value: true })
  return result
}
test('map references come from an explicit same-grid catalogue request', async () => {
  const mark = { id: '00000000-0000-4000-8000-000000000001', name: 'SYN-GNSS', easting: 500000.01234, northing: 9800000.05678, horizontal_crs: syntheticGrid, source_reference: 'Synthetic publication', country: 'Kenya', status: 'verified', distance_m: 12.345 }
  const fetchMock = jest.fn(async (_input: RequestInfo | URL) => response([mark]))
  globalThis.fetch = fetchMock
  const result = await nearestKenCORSStations(500000, 9800000, 3, syntheticGrid)
  const query = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost').searchParams
  expect(query.get('crs')).toBe(syntheticGrid)
  expect(query.get('type')).toBe('gnss')
  expect(result[0]).toMatchObject({ name: 'SYN-GNSS', easting: mark.easting, horizontalCrs: mark.horizontal_crs, sourceReference: mark.source_reference, status: 'catalogue_reviewed', distanceKm: 0.012345 })
})
test('an empty catalogue never manufactures station coordinates', async () => {
  globalThis.fetch = jest.fn(async () => response([]))
  await expect(nearestKenCORSStations(500000, 9800000, 3, syntheticGrid)).resolves.toEqual([])
})
test('an unexpected response grid or absent source evidence fails visibly', async () => {
  const mark = { id: '00000000-0000-4000-8000-000000000001', name: 'SYN-GNSS', easting: 500000, northing: 9800000, horizontal_crs: differentGrid, source_reference: 'Synthetic source', country: 'Kenya', status: 'verified', distance_m: 1 }
  globalThis.fetch = jest.fn(async () => response([mark]))
  await expect(nearestKenCORSStations(500000, 9800000, 3, syntheticGrid)).rejects.toThrow('grid does not match')
  globalThis.fetch = jest.fn(async () => response([{ ...mark, horizontal_crs: syntheticGrid, source_reference: '' }]))
  await expect(nearestKenCORSStations(500000, 9800000, 3, syntheticGrid)).rejects.toThrow()
})

test('reference lookup forwards map cancellation and cleans up its timeout', async () => {
  jest.useFakeTimers()
  try {
    globalThis.fetch = jest.fn(async (_input: RequestInfo | URL, options?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    const parent = new AbortController()
    const job = nearestKenCORSStations(500000, 9800000, 3, syntheticGrid, parent.signal)
    const rejected = expect(job).rejects.toThrow('Synthetic map cancellation')
    parent.abort(new Error('Synthetic map cancellation'))
    await rejected
    expect(jest.getTimerCount()).toBe(0)
  } finally { jest.useRealTimers() }
})
test('an unresponsive reference request times out without inventing station data', async () => {
  jest.useFakeTimers()
  try {
    globalThis.fetch = jest.fn(async (_input: RequestInfo | URL, options?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    const job = nearestKenCORSStations(500000, 9800000, 3, syntheticGrid)
    const rejected = expect(job).rejects.toThrow('Reference catalogue lookup timed out')
    await jest.advanceTimersByTimeAsync(10000)
    await rejected
    expect(jest.getTimerCount()).toBe(0)
  } finally { jest.useRealTimers() }
})
