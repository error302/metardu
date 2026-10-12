/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { SRID_21037 } from '@/lib/map/projectionConstants'
import { GET } from '@/app/api/project/[id]/drainage-alignments/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectReadAccess: jest.fn() }))
jest.mock('@/lib/workspaces/stageReference', () => ({
  resolveStageReference: jest.fn(() => ({
    code: jest.requireActual<typeof import('@/lib/map/projectionConstants')>('@/lib/map/projectionConstants').SRID_21037,
  })),
}))

const mockDb = db.query as jest.Mock
const mockReadAccess = requireProjectReadAccess as jest.Mock

function invoke() {
  const handler = GET as unknown as (
    request: NextRequest,
    context: { params: { id: string }; userId: string },
  ) => Promise<NextResponse>
  return handler(
    new NextRequest('http://localhost/api/project/project-1/drainage-alignments'),
    { params: { id: 'project-1' }, userId: 'alice' },
  )
}

beforeEach(() => {
  mockDb.mockReset()
  mockReadAccess.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
})

test('returns only saved map lines transformed to the declared project CRS', async () => {
  mockDb
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', drawn_features: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', id: 'route-1', properties: { name: 'Storm line A' },
        geometry: { type: 'LineString', coordinates: [[36.8, -1.3], [36.801, -1.3]] },
      }],
    } }] })
    .mockResolvedValueOnce({ rows: [{ horizontal_crs: SRID_21037 }] })

  const response = await invoke()

  expect(response.status).toBe(200)
  const result = await response.json() as {
    projectCrs: string
    alignments: Array<{ label: string; sourceCrs: string; projectCrs: string; vertices: unknown[] }>
    warnings: string[]
  }
  expect(result.projectCrs).toBe(SRID_21037)
  expect(result.alignments).toHaveLength(1)
  expect(result.alignments[0]).toMatchObject({
    label: 'Storm line A', sourceCrs: 'EPSG:4326', projectCrs: SRID_21037,
  })
  expect(result.alignments[0].vertices).toHaveLength(2)
  expect(mockReadAccess).toHaveBeenCalledWith('project-1', 'alice')
  expect(mockDb).toHaveBeenNthCalledWith(1, expect.stringContaining("boundary_data -> 'drawnFeatures'"), ['project-1'])
  expect(mockDb).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM project_reference_systems'), ['project-1'])
})

test('does not read project geometries when access is denied', async () => {
  mockReadAccess.mockResolvedValueOnce({
    ok: false,
    error: Response.json({ error: 'Forbidden' }, { status: 403 }),
  })

  const response = await invoke()

  expect(response.status).toBe(403)
  expect(mockDb).not.toHaveBeenCalled()
})

test('requires a declared project CRS before transforming map lines', async () => {
  const { resolveStageReference } = jest.requireMock('@/lib/workspaces/stageReference') as { resolveStageReference: jest.Mock }
  resolveStageReference.mockReturnValueOnce({ code: null })
  mockDb.mockResolvedValueOnce({ rows: [{ utm_zone: null, hemisphere: null, datum: null, drawn_features: { features: [] } }] })
    .mockResolvedValueOnce({ rows: [] })

  const response = await invoke()

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'CRS_UNDECLARED' })
})
