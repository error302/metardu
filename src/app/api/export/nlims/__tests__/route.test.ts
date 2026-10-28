/** @jest-environment node */
import { expect } from '@jest/globals'
import { NextRequest } from 'next/server'
import { buildProjectReferenceSystem, toReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'

const projectId = '20000000-0000-4000-8000-000000000020'
const boundary = [
  { pointName: 'SYN-A', adjustedEasting: 500000, adjustedNorthing: 10000 },
  { pointName: 'SYN-B', adjustedEasting: 500010, adjustedNorthing: 10000 },
  { pointName: 'SYN-C', adjustedEasting: 500000, adjustedNorthing: 10010 },
]
const prs = buildProjectReferenceSystem({ datum: 'WGS84', utmZone: 36, hemisphere: 'S', distanceMode: 'grid', coordinatePrecision: 3 })
const declared = toReferenceSystemRow(projectId, { prs }, 'owner')

const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
const mockAccess = jest.fn<Promise<{ ok: boolean; error?: Response }>, unknown[]>()
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))
jest.mock('@/lib/db', () => ({ db: { query: (...args: [string, unknown[]?]) => mockQuery(...args) } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectReadAccess: (...args: unknown[]) => mockAccess(...args) }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn().mockResolvedValue(undefined) }))

import { POST } from '@/app/api/export/nlims/route'
import { responseObject, recordValue } from '@/test-utils/response'


// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs32736 = 'EPSG:32736'


const requestBody = {
  projectId,
  submissionType: 'new_registration',
  parcelNumber: 'SYN-LOT-1',
  registry: 'Synthetic Registry',
  county: 'Synthetic County',
  subCounty: 'Synthetic Sub-county',
  surveyor: { name: 'Synthetic Surveyor', licenseNumber: 'ISK/LS/2026/123' },
}
const context = (body: unknown = requestBody) => ({
  body,
  userId: 'owner',
  session: null,
  params: {},
})
const request = () => new NextRequest('http://localhost/api/export/nlims', { method: 'POST' })

beforeEach(() => {
  jest.clearAllMocks()
  mockAccess.mockResolvedValue({ ok: true })
  mockQuery.mockImplementation(async sql => {
    if (sql.includes('FROM projects')) return { rows: [{ id: projectId, name: 'Synthetic cadastral project', survey_type: 'cadastral', boundary_data: { computation: { source: 'field-observations' }, adjustedStations: boundary } }] }
    if (sql.includes('FROM project_reference_systems')) return { rows: [declared] }
    throw new Error(`Unexpected SQL: ${sql}`)
  })
})

test('generates a private METARDU draft from saved boundary coordinates and declared CRS', async () => {
  const response = await POST(request(), context())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  const body = await responseObject(response)
  expect(body.payload).toMatchObject({
    draftMetadata: {
      format: 'METARDU_CADASTRAL_DRAFT_V1',
      projectId,
      coordinateReference: fixtureCrs32736,
      officialRegistryFormatVerified: false,
      registryTransmission: 'not_sent',
    },
    resultingParcels: expect.arrayContaining([
      expect.objectContaining({
        parcelNumber: 'SYN-LOT-1',
        coordinates: expect.arrayContaining([expect.objectContaining({ easting: 500000, northing: 10000 })]),
      }),
    ]),
  })
  expect(recordValue(body.payload).beacons).toEqual([])
  expect(recordValue(body.validation).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'BEACON_DATA_NOT_INCLUDED' })]))
  expect(recordValue(body.provenance).registryTransmission).toBe('not_sent')
})

test('does not export another user’s project', async () => {
  mockAccess.mockResolvedValue({ ok: false, error: new Response('forbidden', { status: 403 }) })
  const response = await POST(request(), context())
  expect(response.status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})

test('refuses legacy project defaults when no explicit CRS declaration exists', async () => {
  mockQuery.mockImplementation(async sql => {
    if (sql.includes('FROM projects')) return { rows: [{ id: projectId, name: 'Synthetic cadastral project', survey_type: 'cadastral', boundary_data: { computation: { source: 'field-observations' }, adjustedStations: boundary } }] }
    if (sql.includes('FROM project_reference_systems')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  })
  const response = await POST(request(), context())
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'CRS_UNDECLARED' })
})

test('requires a saved field-observation adjustment instead of using synthetic or point-cloud geometry', async () => {
  mockQuery.mockImplementation(async sql => {
    if (sql.includes('FROM projects')) return { rows: [{ id: projectId, name: 'Synthetic cadastral project', survey_type: 'cadastral', boundary_data: { adjustedStations: boundary } }] }
    if (sql.includes('FROM project_reference_systems')) return { rows: [declared] }
    throw new Error(`Unexpected SQL: ${sql}`)
  })
  const response = await POST(request(), context())
  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ code: 'BOUNDARY_DATA_UNAVAILABLE' })
})

test('uses saved project geometry instead of caller-supplied coordinates', async () => {
  const response = await POST(request(), context({
    ...requestBody,
    resultingParcels: [{ parcelNumber: 'FORGED', vertices: boundary }],
    crs: { utmZone: 37, hemisphere: 'S', datum: 'Arc 1960' },
  }))
  // The production apiHandler applies the route's strict Zod schema before
  // the handler. This direct handler test confirms the handler itself never
  // consumes client-supplied geometry.
  expect(response.status).toBe(200)
  const result = await responseObject(response)
  const parcels = recordValue(result.payload).resultingParcels
  if (!Array.isArray(parcels)) throw new Error('Expected resulting parcels.')
  expect(recordValue(parcels[0]).parcelNumber).toBe('SYN-LOT-1')
  expect(recordValue(recordValue(result.payload).draftMetadata).officialRegistryFormatVerified).toBe(false)
})
