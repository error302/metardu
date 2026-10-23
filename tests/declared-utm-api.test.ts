/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { POST as createCorridor } from '@/app/api/corridor-networks/route'
import { POST as createMonument } from '@/app/api/boundary-monuments/route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => {
  const query = jest.fn()
  return { db: { query, transaction: jest.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query })) } }
})
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn(), resolveAuthenticatedOrganization: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({ getOperationRateLimitIdentifier: () => 'declared-utm-test', rateLimit: async () => ({ allowed: true, remaining: 19 }) }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (path: string) => path }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))

const cases = [
  { name: 'corridor', post: createCorridor, base: { name: 'Synthetic control' }, path: 'corridor-networks' },
  { name: 'monument', post: createMonument, base: { monument_number: 'SYNTHETIC-1', boundary_name: 'Synthetic', treaty_reference: 'Synthetic practice only' }, path: 'boundary-monuments' },
]
const NORTHERN_UTM = 'EPSG:32632'
const SOUTHERN_UTM = 'EPSG:32755'
const KENYAN_UTM = 'EPSG:21037'
const INVALID_UTM = 'EPSG:32600'
const request = (path: string, body: object) => new NextRequest(`http://127.0.0.1/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-surveyor' }, expires: '2099-01-01T00:00:00Z' })
  jest.mocked(db.query).mockImplementation(async (sql: string) => ({
    rows: sql.startsWith('SELECT') ? [] : [{ id: 'synthetic-created' }], rowCount: 1, command: 'INSERT', oid: 0, fields: [],
  }))
})

describe.each(cases)('$name reference admission', ({ post, base, path }) => {
  test('anonymous writes remain refused', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    expect((await post(request(path, base))).status).toBe(401)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('missing CRS cannot silently become Arc 1960 / zone 37S', async () => {
    expect((await post(request(path, base))).status).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })

  test.each(['EPSG:3857', 'EPSG:4326', 'EPSG:999999', INVALID_UTM])(
    'rejects inadmissible or unregistered reference %s before SQL', async epsg_code => {
      expect((await post(request(path, { ...base, epsg_code }))).status).toBe(400)
      expect(db.query).not.toHaveBeenCalled()
    },
  )

  test.each([{ utm_zone: 37 }, { hemisphere: 'S' }, { datum: 'Arc 1960' }])(
    'rejects metadata contradicting EPSG:32632: %j', async conflicting => {
      expect((await post(request(path, { ...base, epsg_code: NORTHERN_UTM, ...conflicting }))).status).toBe(400)
      expect(db.query).not.toHaveBeenCalled()
    },
  )

  test.each([
    [NORTHERN_UTM, 32, 'N', 'WGS 84'],
    [SOUTHERN_UTM, 55, 'S', 'WGS 84'],
    [KENYAN_UTM, 37, 'S', 'Arc 1960'],
  ] as const)('stores the explicit %s reference rather than Kenyan defaults', async (epsg_code, zone, hemisphere, datum) => {
    const response = await post(request(path, { ...base, epsg_code }))
    expect(response.status).toBe(201)
    const write = jest.mocked(db.query).mock.calls.find(([sql]) => sql.startsWith('INSERT INTO'))
    expect(write).toBeDefined()
    if (!write) throw new Error('Missing insert')
    const [sql, values] = write
    const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(value => value.trim())
    const placeholders = /VALUES\s*\(([^)]+)\)/.exec(sql)?.[1].split(',').map(value => value.trim()) ?? []
    const row = Object.fromEntries(columns.map((column, index) => {
      const parameter = /^\$(\d+)$/.exec(placeholders[index] ?? '')
      return [column, parameter ? values?.[Number(parameter[1]) - 1] : undefined]
    }))
    expect(row).toMatchObject({ epsg_code, utm_zone: zone, hemisphere, datum })
  })
})

test('corridor point units/ranges are checked before an existing version can be deactivated', async () => {
  const response = await createCorridor(request('corridor-networks', {
    name: 'Synthetic control', epsg_code: NORTHERN_UTM,
    control_points: [{ point_name: 'Bad', easting: 9, northing: 52 }],
  }))
  expect(response.status).toBe(400)
  expect(db.query).not.toHaveBeenCalled()
})

test('an unregistered corridor reference with points returns a validation error before SQL', async () => {
  const response = await createCorridor(request('corridor-networks', {
    name: 'Synthetic control', epsg_code: 'EPSG:999999',
    control_points: [{ point_name: 'SYNTHETIC', easting: 500000, northing: 5800000 }],
  }))
  expect(response.status).toBe(400)
  expect(db.query).not.toHaveBeenCalled()
})

test('another owner cannot supersede a named corridor through the API', async () => {
  jest.mocked(db.query).mockImplementation(async (sql: string) => ({
    rows: sql.includes('SELECT id, version, created_by') ? [{ id: 'other-version', version: 1, created_by: 'other-surveyor' }] : [],
    rowCount: 1, command: 'SELECT', oid: 0, fields: [],
  }))
  const response = await createCorridor(request('corridor-networks', { name: 'Other control', epsg_code: NORTHERN_UTM }))
  expect(response.status).toBe(403)
  expect(jest.mocked(db.query).mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false)
})

test.each([['older', 'latest'], ['older']])('inconsistent active corridor heads %j return a conflict before mutation', async (...activeIds) => {
  jest.mocked(db.query).mockImplementation(async (sql: string) => ({
    rows: sql.includes('SELECT id, version, created_by')
      ? [{ id: 'latest', version: 2, created_by: 'synthetic-surveyor' }]
      : sql.includes('AND is_active = TRUE') ? activeIds.map(id => ({ id })) : [],
    rowCount: 1, command: 'SELECT', oid: 0, fields: [],
  }))
  const response = await createCorridor(request('corridor-networks', { name: 'Inconsistent history', epsg_code: NORTHERN_UTM }))
  expect(response.status).toBe(409)
  expect(jest.mocked(db.query).mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false)
})

test('monument target coordinates cannot be a partial pair', async () => {
  const response = await createMonument(request('boundary-monuments', {
    monument_number: 'SYNTHETIC-1', boundary_name: 'Synthetic', treaty_reference: 'Synthetic practice only',
    epsg_code: NORTHERN_UTM, easting: 500000,
  }))
  expect(response.status).toBe(400)
  expect(db.query).not.toHaveBeenCalled()
})

test.each([
  { epsg_code: 'EPSG:3857', easting: 500000, northing: 5800000 },
  { epsg_code: 'EPSG:999999', easting: 500000, northing: 5800000 },
  { epsg_code: NORTHERN_UTM, easting: 9, northing: 52 },
  { epsg_code: NORTHERN_UTM, latitude: 52 },
  { epsg_code: NORTHERN_UTM, latitude: 91, longitude: 9 },
])('invalid monument coordinates/reference produce validation errors, not SQL or server errors: %j', async coordinates => {
  const response = await createMonument(request('boundary-monuments', {
    monument_number: 'SYNTHETIC-1', boundary_name: 'Synthetic', treaty_reference: 'Synthetic practice only', ...coordinates,
  }))
  expect(response.status).toBe(400)
  expect(db.query).not.toHaveBeenCalled()
})

test('a declared northern UTM corridor preserves zero and missing heights without a conversion', async () => {
  const response = await createCorridor(request('corridor-networks', {
    name: 'Synthetic control', epsg_code: ' epsg:32632 ', datum: 'WGS84', utm_zone: 32, hemisphere: 'N',
    control_points: [{ point_name: 'ZERO', easting: 500000, northing: 5800000, elevation: 0 },
      { point_name: 'UNKNOWN', easting: 500010, northing: 5800010 }],
  }))
  expect(response.status).toBe(201)
  const writes = jest.mocked(db.query).mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO corridor_control_points'))
  expect(writes).toHaveLength(2)
  expect(writes[0][1]?.slice(1, 6)).toEqual(['ZERO', 'traverse', 500000, 5800000, 0])
  expect(writes[1][1]?.slice(1, 6)).toEqual(['UNKNOWN', 'traverse', 500010, 5800010, undefined])
})
