/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { GET, PUT } from '@/app/api/project/[id]/pipe-network/route'
import { expect } from '@jest/globals'
import { mr } from '@/test-utils/mock-rows'



// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs21037 = 'EPSG:21037'
const fixtureCrs21036 = 'EPSG:21036'


jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({
  requireProjectOwnership: jest.fn(),
  requireProjectReadAccess: jest.fn(),
}))
jest.mock('@/lib/workspaces/stageReference', () => ({
  resolveStageReference: jest.fn((reference: Record<string, unknown> | undefined) => ({ code: reference?.horizontal_crs ?? null })),
}))

const mockQuery = db.query as jest.MockedFunction<typeof db.query>
const mockOwnership = requireProjectOwnership as jest.Mock
const mockReadAccess = requireProjectReadAccess as jest.Mock
const mockResolveReference = resolveStageReference as jest.Mock

const network = {
  version: 1 as const,
  projectCrs: 'EPSG:21037',
  minimumCoverM: 1.2,
  stationIntervalM: 5,
  manholes: [{ id: 'MH-1', easting: 500000, northing: 9800000, groundLevel: 100, invertOut: 98 }],
  pipes: [],
}

function callGet() {
  const request = new NextRequest('http://localhost/api/project/project-1/pipe-network')
  const handler = GET as unknown as (req: NextRequest, context: { params: { id: string }; userId: string }) => Promise<NextResponse>
  return handler(request, { params: { id: 'project-1' }, userId: 'alice' })
}

function callPut(body: unknown) {
  const request = new NextRequest('http://localhost/api/project/project-1/pipe-network', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const handler = PUT as unknown as (
    req: NextRequest,
    context: { params: { id: string }; userId: string; body: unknown },
  ) => Promise<NextResponse>
  return handler(request, { params: { id: 'project-1' }, userId: 'alice', body })
}

beforeEach(() => {
  mockQuery.mockReset()
  mockOwnership.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
  mockReadAccess.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
  mockResolveReference.mockReset().mockImplementation((reference: Record<string, unknown> | undefined) => ({ code: reference?.horizontal_crs ?? null }))
})

test('loads the saved project network and its declared CRS using read access', async () => {
  mockQuery
    .mockResolvedValueOnce(mr([{ id: 'project-1', name: 'Drainage A', utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: { manholes: [{ id: 'existing' }] }, pipeNetwork: network } }]))
    .mockResolvedValueOnce(mr([{ horizontal_crs: fixtureCrs21037 }]))

  const response = await callGet()
  const result = await response.json() as Record<string, unknown>

  expect(response.status).toBe(200)
  expect(result).toMatchObject({ projectName: 'Drainage A', declaredProjectCrs: fixtureCrs21037, network })
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(mockReadAccess).toHaveBeenCalledWith('project-1', 'alice')
})

test('refuses to load project data when read access is denied', async () => {
  mockReadAccess.mockResolvedValueOnce({ ok: false, error: Response.json({ error: 'Forbidden' }, { status: 403 }) })
  const response = await callGet()
  expect(response.status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})

test('returns an explicit error when a saved project CRS declaration is invalid', async () => {
  mockQuery
    .mockResolvedValueOnce(mr([{ id: 'project-1', name: 'Drainage A', utm_zone: null, hemisphere: null, datum: null, engineering_data: { pipeNetwork: network } }]))
    .mockResolvedValueOnce(mr([{}]))
  mockResolveReference.mockReturnValueOnce({ code: null })

  const response = await callGet()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    network,
    declaredProjectCrs: null,
    projectCrsIssue: expect.stringMatching(/reference system is invalid/i),
  })
})

test('refuses to save coordinates when their CRS differs from the declared project CRS', async () => {
  mockQuery
    .mockResolvedValueOnce(mr([{ id: 'project-1', name: 'Drainage A', utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: { safe: true } } }]))
    .mockResolvedValueOnce(mr([{ horizontal_crs: fixtureCrs21036 }]))

  const response = await callPut({ network })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'PROJECT_CRS_MISMATCH' })
  expect(mockQuery).toHaveBeenCalledTimes(2)
})

test('saves only the standalone network JSON and preserves other engineering data', async () => {
  mockQuery
    .mockResolvedValueOnce(mr([{ id: 'project-1', name: 'Drainage A', utm_zone: null, hemisphere: null, datum: null, engineering_data: { drainage: { manholes: [{ id: 'existing' }] } } }]))
    .mockResolvedValueOnce(mr([]))
    .mockResolvedValueOnce(mr([{ id: 'project-1' }]))

  const response = await callPut({ network })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ saved: true, network })
  expect(mockOwnership).toHaveBeenCalledWith('project-1', 'alice')
  expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining("jsonb_build_object('pipeNetwork'"), ['project-1', JSON.stringify(network), 'alice'])
})
