/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { SaveIPsSchema } from '@/lib/validation/apiSchemas'
import { POST as saveIPs, PUT as updateIP } from '../ips/route'
import { GET as readAlignment } from '../alignment/route'
import { POST as saveVIPs } from '../vips/route'
import { POST as saveStations, GET as readStations } from '../stations/route'
import { POST as saveEarthworks } from '../earthworks/route'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (options: { schema?: import('zod').ZodSchema }, handler: (req: NextRequest, ctx: { userId: string; body: unknown; params: Record<string, string> }) => Promise<Response>) =>
  async (req: NextRequest, ctx: { userId: string; body: unknown; params: Record<string, string> }) => {
    const parsed = options.schema?.safeParse(ctx.body)
    if (parsed && !parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 })
    try { return await handler(req, { ...ctx, body: parsed?.success ? parsed.data as unknown : ctx.body }) }
    catch (error) {
      const { AppError } = jest.requireActual<typeof import('@/lib/api/errors')>('@/lib/api/errors')
      if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.statusCode })
      throw error
    }
  } }))
jest.mock('@/lib/db', () => ({ db: { getClient: jest.fn(), query: jest.fn(), transaction: jest.fn() }, setRlsContext: jest.fn() }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn(), requireProjectReadAccess: jest.fn() }))
jest.mock('@/lib/engineering/designRevisions', () => ({ recordDesignRevision: jest.fn().mockResolvedValue({ revision: { id: 'revision', revision: 'R01' } }) }))
jest.mock('@/lib/observations/observationBatches', () => ({ recordEvidenceEvent: jest.fn().mockResolvedValue(undefined) }))

const fixtureCrs = 'EPSG:32737'
const input = [{ name: 'A', easting: 0, northing: 0, radius: 0 }, { name: 'PI', easting: 100, northing: 0, radius: 20 }, { name: 'B', easting: 100, northing: 100, radius: 0 }]
let owner = 'owner', stored: Array<Record<string, unknown>> = []
const query = jest.fn(async (sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
  if (/FROM road_alignments|JOIN road_alignments|FROM projects/.test(sql)) return { rows: [{ id: 'alignment', alignment_id: 'alignment', project_id: 'project', project_owner: owner, user_id: owner, road_name: 'Synthetic Road', start_chainage: 1000, coordinate_system: fixtureCrs }] }
  if (/FROM alignment_ips/.test(sql)) return { rows: stored }
  if (/DELETE FROM alignment_ips/.test(sql)) { stored = []; return { rows: [] } }
  if (/INSERT INTO alignment_ips/.test(sql)) {
    const columns = sql.match(/alignment_ips\s*\(([^)]+)\)/)?.[1].split(',').map(s => s.trim()) ?? []
    const row: Record<string, unknown> = { id: `ip-${stored.length}` }
    columns.forEach((column, i) => { row[column] = params[i] })
    stored.push(row); return { rows: [row] }
  }
  if (/UPDATE alignment_ips/.test(sql)) {
    const row = stored.find(value => value.id === params[0]) ?? { id: params[0] }
    for (const match of sql.matchAll(/(\w+)\s*=\s*\$(\d+)/g)) row[match[1]] = params[Number(match[2]) - 1]
    return { rows: [row] }
  }
  return { rows: [] }
})
const client = { query, release: jest.fn() }
type Handler = (req: NextRequest, ctx: { userId: string; body: unknown; params: Record<string, string> }) => Promise<Response>
const invoke = (handler: unknown, body?: unknown, url = '/api/engineering/ips') => (handler as Handler)(new NextRequest(`http://127.0.0.1:3021${url}`, { method: body === undefined ? 'GET' : 'POST' }), { userId: 'owner', body, params: {} })

beforeEach(() => {
  jest.clearAllMocks(); owner = 'owner'; stored = []
  jest.mocked(db.getClient).mockResolvedValue(client as unknown as import('pg').PoolClient)
  jest.mocked(db.query).mockImplementation(query as unknown as typeof db.query)
  jest.mocked(db.transaction).mockImplementation(async callback => callback(client as unknown as import('pg').PoolClient))
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ ok: true, projectUserId: 'owner' })
})

it('accepts zero-radius endpoints, explicit transitions and an explicitly cleared input list', () => {
  expect(SaveIPsSchema.safeParse({ alignment_id: 'alignment', ips: input }).success).toBe(true)
  const result = SaveIPsSchema.parse({ alignment_id: 'alignment', ips: [{ ...input[1], has_transition: true, transition_length_in: 10, transition_length_out: 10 }] })
  expect(result.ips[0]).toMatchObject({ has_transition: true, transition_length_in: 10, transition_length_out: 10 })
  expect(SaveIPsSchema.safeParse({ alignment_id: 'alignment', ips: [] }).success).toBe(true)
})

it('derives the middle PI and corrected chainages on the server, retaining endpoint zeros', async () => {
  const response = await invoke(saveIPs, { alignment_id: 'alignment', ips: input })
  expect(response.status).toBe(200)
  const result = await response.json() as { data: Array<Record<string, number | null>> }
  expect(result.data[0].tangent_length).toBeNull()
  expect(result.data[1].tangent_length).toBeCloseTo(20, 10)
  expect(result.data[1].chainage_tc).toBeCloseTo(1080, 10)
  expect(result.data[1].chainage_ct).toBeCloseTo(1080 + 10 * Math.PI, 10)
  expect(result.data[2].tangent_length).toBeNull()
})

it('does not accept caller-authored computed geometry through PUT', async () => {
  const response = await invoke(updateIP, { id: 'ip', tangent_length: 999, chainage_tc: 999 })
  expect(response.status).toBe(400)
  expect(query).not.toHaveBeenCalled()
})

it('synchronizes accepted inputs with the matching canonical project draft before commit', async () => {
  await invoke(saveIPs, { alignment_id: 'alignment', ips: input })
  expect(query.mock.calls.some(([sql]) => /^\s*UPDATE projects/.test(sql) && sql.includes('jsonb_set') && sql.includes('roadName'))).toBe(true)
})

it.each([
  ['IPs', saveIPs, { alignment_id: 'alignment', ips: [{ name: 'PI', easting: 0, northing: 0, radius: 20 }] }],
  ['VIPs', saveVIPs, { alignment_id: 'alignment', vips: [{ chainage: 0, reduced_level: 0, k_value: 20 }] }],
  ['stations', saveStations, { alignment_id: 'alignment', stations: [{ chainage: 0, ground_level: 0 }] }],
  ['earthworks', saveEarthworks, { alignment_id: '11111111-1111-4111-8111-111111111111', client_run_id: '22222222-2222-4222-8222-222222222222', expected_input_hash: 'a'.repeat(64) }],
])('refuses another owner before any %s mutation when row policies are absent', async (_name, handler, body) => {
  owner = 'someone-else'
  const response = await invoke(handler, body)
  expect(response.status).toBe(403)
  expect(query.mock.calls.some(([sql]) => /^\s*(INSERT|DELETE|UPDATE)\b/.test(sql))).toBe(false)
})

it.each([['alignment', readAlignment, '/api/engineering/alignment?project_id=project'], ['stations', readStations, '/api/engineering/stations?alignment_id=alignment']])('checks project read access before returning %s records', async (_name, handler, url) => {
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ ok: false, error: Response.json({ error: 'Forbidden' }, { status: 403 }) as import('next/server').NextResponse })
  const response = await invoke(handler, undefined, url as string)
  expect(response.status).toBe(403)
  expect(query.mock.calls.some(([sql]) => /SELECT \* FROM (alignment_ips|alignment_stations|cross_section_stations)/.test(sql))).toBe(false)
})

it('writes VIPs and station profiles to the same canonical tables the reload endpoint reads', async () => {
  await invoke(saveVIPs, { alignment_id: 'alignment', vips: [{ chainage: 0, reduced_level: 0, curve_length: 50, k_value: null }] })
  await invoke(saveStations, { alignment_id: 'alignment', stations: [{ chainage: 0, ground_level: 0, design_level: -1, design_level_source: 'manual', ground_profile: [{ offset: -10, level: 0 }, { offset: 0, level: 0 }, { offset: 10, level: 0 }] }] })
  expect(query.mock.calls.some(([sql]) => /INSERT INTO alignment_vertical_ips/.test(sql))).toBe(true)
  expect(query.mock.calls.some(([sql]) => /INSERT INTO cross_section_stations/.test(sql))).toBe(true)
  expect(query.mock.calls.some(([sql, values]) => /cross_section_stations/.test(sql) && (values ?? []).some(value => typeof value === 'string' && value.includes('"designLevel":-1')))).toBe(true)
})
