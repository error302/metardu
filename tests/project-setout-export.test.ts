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
const definition = '20000000-0000-4000-8000-000000000001'
const observation = {
  id: 'shot-1', project_id: project, definition_id: definition, definition_name: 'Drain line A',
  definition_crs: 'EPSG:21037', design_revision: 2, setout_point_id: 'point-1', label: 'MH-01',
  design_easting: '500000.000', design_northing: '9860000.000', design_rl: '100.000',
  observed_easting: '499999.997', observed_northing: '9860000.004', observed_rl: null,
  d_e: '-0.0030', d_n: '0.0040', d_z: null, horizontal_error: '0.0050', vertical_error: null,
  threshold_h: '0.0100', threshold_v: '0.0050', result: 'INFO', reported_accuracy_m: '0.0000',
  tolerance_profile_id: null, tolerance_version: 'default-v1', instrument: 'Total station',
  instrument_serial: null, operator_name: null, crew: null, observation_batch_id: null,
  staked_by: 'user-1', staked_at: new Date('2026-10-08T08:00:00.000Z'), notes: '=1+1, quoted note', client_shot_id: 'device-1',
}
const context = { params: { id: project }, userId: 'user-1' }
const request = (query = `definitionId=${definition}&revision=2`) => new NextRequest(`http://localhost/api/project/${project}/setout/export?${query}`)

beforeEach(() => {
  jest.clearAllMocks()
  mockAccess.mockResolvedValue('owner')
  mockQuery.mockResolvedValue({ rows: [observation] })
})

test('exports stored observations with revision, criteria, identity and server recording time', async () => {
  const response = await GET(request(), context)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('content-disposition')).toContain('attachment')
  const parsed = Papa.parse<Record<string, string>>(await response.text(), { header: true })
  expect(parsed.errors).toEqual([])
  expect(parsed.data[0]).toMatchObject({
    Observation_ID: 'shot-1', Design_Revision: '2', Observed_RL_m: '', Recorded_Status: 'INFO',
    Delta_E_m: '-0.003', Recorded_H_Tolerance_m: '0.01', Reported_H_Accuracy_m: '0',
    Server_Recorded_At_UTC: '2026-10-08T08:00:00.000Z', Capture_CRS_Evidence: 'Not stored with observation',
  })
  expect(parsed.data[0].Notes).toBe("'=1+1, quoted note")
  expect(mockQuery.mock.calls[0][1]).toEqual([definition, project, 2, 10001])
})
test('denies another account before querying private observations', async () => {
  mockAccess.mockResolvedValue(null)
  expect((await GET(request(), context)).status).toBe(404)
  expect(mockQuery).not.toHaveBeenCalled()
})
test.each(['0', '-1', '2.5', 'garbage', '0x2', '2e0'])('rejects invalid revision %s', async (revision) => {
  expect((await GET(request(`definitionId=${definition}&revision=${revision}`), context)).status).toBe(400)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('does not invent observations for an empty or inaccessible definition', async () => {
  mockQuery.mockResolvedValue({ rows: [] })
  expect((await GET(request(), context)).status).toBe(404)
})
test('exports all saved re-stakes, preserving the previous failed shot', async () => {
  mockQuery.mockResolvedValue({ rows: [{ ...observation, id: 'failed-shot', result: 'FAIL' }, observation] })
  const parsed = Papa.parse<Record<string, string>>(await (await GET(request(), context)).text(), { header: true })
  expect(parsed.data.map((row) => row.Recorded_Status)).toEqual(['FAIL', 'INFO'])
})

test('downloads a private printable draft with legacy evidence clearly unassessed and its canonical logo embedded', async () => {
  const response = await GET(request(`definitionId=${definition}&revision=2&format=html`), context)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/html')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
  const html = await response.text()
  expect(html).toContain('data:image/png;base64,')
  expect(html).toContain('Legacy observations — NOT ASSESSED')
  expect(html).not.toContain('<script>')
})
