/** @jest-environment node */
import { NextRequest } from 'next/server'
import Papa from 'papaparse'
const mockAccess = jest.fn<Promise<string | null>, unknown[]>()
const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, unknown[]>()
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) } }))
jest.mock('@/lib/auth/rbac', () => ({ canAccessProject: (...args: unknown[]) => mockAccess(...args) }))
import { GET } from '@/app/api/project/[id]/setout/export/route'
const project = '10000000-0000-4000-8000-000000000001'
const context = { params: { id: project }, userId: 'alice' }
const row = { id: 'reading-1', project_id: project, project_name: 'Synthetic project', definition_id: null, label: 'C1', level: null, base_easting: '500000.000', base_northing: '9800000.000', base_rl: null, top_easting: '500000.010', top_northing: '9800000.000', top_rl: null, offset_h: '0.0100', tilt_ratio: '1:inf', tolerance_ratio: '1:600', result: 'PASS', instrument: null, observed_by: 'alice', observed_at: '2026-10-14T06:00:00Z', notes: '=1+1', capture_snapshot: null, client_reading_id: null }
const request = (query = 'kind=plumb&format=csv') => new NextRequest(`https://metardu.space/api/project/${project}/setout/export?${query}`)
beforeEach(() => { jest.clearAllMocks(); mockAccess.mockResolvedValue('owner'); mockQuery.mockResolvedValue({ rows: [row] }) })
test('exports real saved plumb history without inventing current assessment for an old PASS', async () => {
  const response = await GET(request(), context)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  const parsed = Papa.parse<Record<string, string>>(await response.text(), { header: true })
  expect(parsed.errors).toEqual([])
  expect(parsed.data[0].Recorded_result).toBe('PASS')
  expect(parsed.data[0].Export_assessment).toBe('NOT ASSESSED')
  expect(parsed.data[0].Capture_CRS).toBe('')
  expect(parsed.data[0].Notes).toBe("'=1+1")
})
test('a project access refusal cannot query or export private plumb observations', async () => {
  mockAccess.mockResolvedValue(null)
  expect((await GET(request(), context)).status).toBe(404)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('saved export filters retain exact label and normalized server-recording UTC bounds', async () => {
  expect((await GET(request('kind=plumb&label=C1&fromUtc=2026-10-14T09%3A00%3A00%2B03%3A00&toUtc=2026-10-14T07%3A00%3A00Z'), context)).status).toBe(200)
  expect(mockQuery.mock.calls[0][1]).toEqual([project, 'C1', '2026-10-14T06:00:00.000Z', '2026-10-14T07:00:00.000Z', 1001])
})
test('unsupported kinds and contradictory time filters do not query records', async () => {
  for (const query of ['kind=unknown', 'kind=plumb&fromUtc=bad', 'kind=plumb&fromUtc=2026-10-15T00:00:00Z&toUtc=2026-10-14T00:00:00Z']) expect((await GET(request(query), context)).status).toBe(400)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('empty and excessive histories return explicit errors rather than empty or silently truncated reports', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] })
  expect((await GET(request(), context)).status).toBe(404)
  mockQuery.mockResolvedValueOnce({ rows: Array.from({ length: 1001 }, () => row) })
  expect((await GET(request(), context)).status).toBe(413)
  mockQuery.mockResolvedValueOnce({ rows: Array.from({ length: 251 }, () => row) })
  expect((await GET(request('kind=plumb&format=pdf'), context)).status).toBe(413)
})
test('a mismatched returned project cannot be exported under the requested project authorization', async () => {
  mockQuery.mockResolvedValue({ rows: [{ ...row, project_id: 'other-project' }] })
  expect((await GET(request(), context)).status).toBe(409)
})
