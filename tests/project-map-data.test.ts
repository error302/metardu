import { loadProjectMapData } from '@/lib/workspaces/projectMapData'

const grid = 'EPSG:32636'
const otherGrid = 'EPSG:32736'
const reference = { referenceSystem: { prs: { horizontalCrs: grid, units: 'metres', zone: 36, hemisphere: 'N', coordinatePrecision: 3, distanceMode: 'grid' } } }
const station = { pointName: 'TEST-ZERO', originalEasting: 500000, originalNorthing: 0, adjustedEasting: 500000, adjustedNorthing: 0 }
const boundary = [station, { ...station, pointName: 'B', adjustedEasting: 500010 }, { ...station, pointName: 'C', adjustedNorthing: 10 }]
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
beforeEach(() => { jest.clearAllMocks() })
function fixture(project: unknown, points: unknown[] = []) {
  mockFetch.mockImplementation(async url => String(url).endsWith('/reference-system') ? response(reference) : String(url).endsWith('/points') ? response({ data: points }) : response({ data: project }))
}
test('loads the dedicated project and reference endpoints, preserving zero and full coordinates', async () => {
  fixture({ name: 'Synthetic', boundary_data: { adjustedStations: boundary } })
  const signal = new AbortController().signal
  const result = await loadProjectMapData('test-project', signal, mockFetch)
  expect(result.geometryKind).toBe('ordered_boundary')
  expect(result.stations[0]).toEqual(station)
  expect(result.epsg).toBe(grid)
  expect(mockFetch.mock.calls.map(call => call[0])).toEqual(['/api/project/test-project', '/api/project/test-project/reference-system'])
  expect(mockFetch.mock.calls.every(call => call[1]?.signal === signal && call[1]?.cache === 'no-store')).toBe(true)
})
test.each([null, '', '500000m', Infinity])('rejects invalid coordinates instead of inventing zero (%s)', async invalid => {
  fixture({ boundary_data: { adjustedStations: [{ ...station, adjustedEasting: invalid }, ...boundary.slice(1)] } })
  await expect(loadProjectMapData('test', undefined, mockFetch)).rejects.toThrow(/coordinate/i)
})
test('a failed reference request stays a request error rather than a missing declaration', async () => {
  mockFetch.mockImplementation(async url => String(url).endsWith('/reference-system') ? response({ error: 'Synthetic permission denial' }, 403) : response({ data: {} }))
  await expect(loadProjectMapData('test', undefined, mockFetch)).rejects.toThrow('Synthetic permission denial')
})
test('legacy project defaults cannot replace a missing declaration', async () => {
  mockFetch.mockImplementation(async url => String(url).endsWith('/reference-system') ? response({ referenceSystem: null }) : response({ data: { datum: 'WGS84', utm_zone: 36, hemisphere: 'N' } }))
  await expect(loadProjectMapData('test', undefined, mockFetch)).rejects.toThrow(/Declare/i)
})
test('a malformed reference gives an actionable error without exposing parser internals', async () => {
  mockFetch.mockImplementation(async url => String(url).endsWith('/reference-system') ? response({ referenceSystem: { prs: {} } }) : response({ data: {} }))
  await expect(loadProjectMapData('test', undefined, mockFetch)).rejects.toThrow('Review Project Settings before mapping.')
})
test('a single field point renders without synthesizing an original coordinate or a parcel', async () => {
  fixture({}, [{ point_name: 'TEST-POINT', easting: 500000, northing: 0, horizontal_crs: grid }])
  const result = await loadProjectMapData('test', undefined, mockFetch)
  expect(result.geometryKind).toBe('points')
  expect(result.stations).toEqual([{ pointName: 'TEST-POINT', adjustedEasting: 500000, adjustedNorthing: 0 }])
})
test.each([null, otherGrid])('rejects field points with missing or mismatched source grids (%s)', async sourceGrid => {
  fixture({}, [{ point_name: 'TEST-POINT', easting: 500000, northing: 0, horizontal_crs: sourceGrid }])
  await expect(loadProjectMapData('test', undefined, mockFetch)).rejects.toThrow(/source grid/i)
})
test('does not silently replace an incomplete saved boundary with unrelated field points', async () => {
  fixture({ boundary_data: { adjustedStations: [station] } }, [{ point_name: 'P', easting: 500000, northing: 0, horizontal_crs: grid }])
  await expect(loadProjectMapData('test', undefined, mockFetch)).rejects.toThrow(/boundary/i)
  expect(mockFetch).toHaveBeenCalledTimes(2)
})
