/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { GET, PUT } from '@/app/api/project/[id]/cad-document/route'
import { buildProjectCadDocument } from '@/lib/cad/projectCadDocument'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn() }))

const mockDbQuery = db.query as jest.Mock
const mockOwnership = requireProjectOwnership as jest.Mock

const document = buildProjectCadDocument({ projectName: 'CAD test' }, []).document

function invoke(body: unknown) {
  const request = new NextRequest('http://localhost/api/project/project-1/cad-document', {
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

function invokeGet() {
  const request = new NextRequest('http://localhost/api/project/project-1/cad-document')
  const handler = GET as unknown as (
    req: NextRequest,
    context: { params: { id: string }; userId: string },
  ) => Promise<NextResponse>
  return handler(request, { params: { id: 'project-1' }, userId: 'alice' })
}

beforeEach(() => {
  mockDbQuery.mockReset().mockResolvedValue({ rows: [{ id: 'project-1', updated_at: new Date('2026-10-07T00:00:00Z') }] })
  mockOwnership.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
})

test('saves the CAD drawing without replacing computed adjusted stations', async () => {
  const response = await invoke({ document })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ saved: true })
  expect(mockOwnership).toHaveBeenCalledWith('project-1', 'alice')
  const [sql, values] = mockDbQuery.mock.calls[0] as [string, unknown[]]
  expect(sql).toContain("jsonb_set(")
  expect(sql).toContain("'{cadDocument}'")
  expect(sql).not.toContain('adjustedStations')
  expect(JSON.parse(values[1] as string)).toEqual(document)
})

test('rejects malformed CAD data before accessing the project row', async () => {
  const response = await invoke({ document: { ...document, width: Number.NaN } })
  expect(response.status).toBe(400)
  expect(mockOwnership).not.toHaveBeenCalled()
  expect(mockDbQuery).not.toHaveBeenCalled()
})

test('does not report success when project boundary data cannot be safely updated', async () => {
  mockDbQuery.mockResolvedValueOnce({ rows: [] })
  const response = await invoke({ document })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ error: expect.any(String) })
})

test('loads only the explicit saved CAD artifact for the owning project', async () => {
  mockDbQuery.mockResolvedValueOnce({ rows: [{ cad_document: document }] })
  const response = await invokeGet()

  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ document })
  expect(mockOwnership).toHaveBeenCalledWith('project-1', 'alice')
  expect(mockDbQuery.mock.calls[0][0]).toContain("boundary_data -> 'cadDocument'")
})

test('does not treat project survey points or malformed JSON as a saved boundary document', async () => {
  mockDbQuery.mockResolvedValueOnce({ rows: [{ cad_document: { beacons: 'not-an-array' } }] })
  const response = await invokeGet()
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: expect.any(String) })
})
