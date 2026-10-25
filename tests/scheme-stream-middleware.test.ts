/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST as exportPost } from '@/app/api/scheme/export/geojson/route'
import { POST as boundaryPost } from '@/app/api/project/[id]/scheme/parcel-boundary/route'
import { POST as sharePost } from '@/app/api/project/[id]/scheme/shares/route'
import { createParcelShare } from '@/lib/scheme/parcelSharing'
import { executeSchemeExport } from '@/lib/scheme/exportCommands'
import { saveReviewedBoundary } from '@/lib/scheme/reviewedBoundaryCommands'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '33333333-3333-4333-8333-333333333333',
  requestId = '22222222-2222-4222-8222-222222222222',
  sourceCrs = 'EPSG:32737'
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rateLimit', () => ({
  rateLimit: async () => ({ allowed: true, remaining: 99 }),
  getOperationRateLimitIdentifier: () => 'synthetic-stream-fixture',
}))
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  auditLog: jest.fn(),
}))
jest.mock('@/lib/auth/requestContext', () => ({
  setAuthenticatedDatabaseContext: jest.fn(),
  resolveAuthenticatedOrganization: async () => null,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({
  routeHitsTotal: { inc: jest.fn() },
}))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({
  normalizePath: (value: string) => value,
}))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))
jest.mock('@/lib/scheme/exportCommands', () => ({
  executeSchemeExport: jest.fn(async () => ({
    bytes: Buffer.from('synthetic registered bytes'),
    filename: `boundary-drafts-${requestId}.geojson`,
    storagePath: 'synthetic-owned-file',
    contentHash: 'c'.repeat(64),
    deliverableId: actor,
    revisionId: project,
    revision: 1,
    requestId,
    requestHash: 'b'.repeat(64),
    sourceHash: 'a'.repeat(64),
    sourceRevision: `scheme:${'A'.repeat(43)}`,
    sourceCrs,
    outputCrs: 'EPSG:4326',
    replayed: false,
  })),
}))
jest.mock('@/lib/scheme/reviewedBoundaryCommands', () => ({
  readBoundaryDirectory: jest.fn(),
  readBoundaryReceipt: jest.fn(),
  readBoundarySource: jest.fn(),
  saveReviewedBoundary: jest.fn(
    async (
      _actor: string,
      _project: string,
      input: Record<string, unknown>,
    ) => ({ requestId: input.request_id }),
  ),
}))
jest.mock('@/lib/scheme/parcelSharing', () => ({ createParcelShare: jest.fn(async () => ({ id: requestId })), revokeParcelShare: jest.fn(), listParcelShares: jest.fn(), previewParcelShare: jest.fn() }))
const body = {
  projectId: project,
  expectedUserId: actor,
  requestId,
  parcelIds: ['44444444-4444-4444-8444-444444444444'],
  sourceHash: 'a'.repeat(64),
  reviewed: true,
}
const context = { params: Promise.resolve({ id: project }) }
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(getServerSession)
    .mockResolvedValue({ user: { id: actor }, expires: '2026-11-01T00:00:00Z' })
})
it('passes export bytes through the real middleware without pre-consuming JSON', async () => {
  const req = new NextRequest(
      'http://127.0.0.1:3021/api/scheme/export/geojson',
      { method: 'POST', body: JSON.stringify(body) },
    ),
    json = jest.spyOn(req, 'json')
  const response = await exportPost(req, context)
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('synthetic registered bytes')
  expect(json).not.toHaveBeenCalled()
  expect(executeSchemeExport).toHaveBeenCalledWith(
    actor,
    project,
    requestId,
    'geojson',
    body,
    false,
  )
})
it('passes reviewed-boundary intent through the real middleware stream', async () => {
  const command = {
    parcel_id: body.parcelIds[0],
    traverse_id: requestId,
    request_id: requestId,
    evidence_hash: 'a'.repeat(64),
    source_crs: sourceCrs,
    ordered_coordinate_ids: [actor, project, requestId],
    reviewed: true,
    note: 'synthetic middleware check',
  }
  const req = new NextRequest(
      `http://127.0.0.1:3021/api/project/${project}/scheme/parcel-boundary`,
      { method: 'POST', body: JSON.stringify(command) },
    ),
    json = jest.spyOn(req, 'json')
  expect((await boundaryPost(req, context)).status).toBe(200)
  expect(json).not.toHaveBeenCalled()
  expect(saveReviewedBoundary).toHaveBeenCalledWith(actor, project, command)
})
it('returns a client validation error for an invalid export command', async () => {
  const response = await exportPost(
    new NextRequest('http://127.0.0.1:3021/api/scheme/export/geojson', {
      method: 'POST',
      body: JSON.stringify({ ...body, reviewed: false }),
    }),
    context,
  )
  expect(response.status).toBe(400)
  expect(executeSchemeExport).not.toHaveBeenCalled()
})
it('bounds the stream before JSON parsing and still requires authentication', async () => {
  const req = new NextRequest(
      'http://127.0.0.1:3021/api/scheme/export/geojson',
      { method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(9000) }) },
    ),
    json = jest.spyOn(req, 'json')
  expect((await exportPost(req, context)).status).toBe(413)
  expect(json).not.toHaveBeenCalled()
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect(
    (
      await exportPost(
        new NextRequest('http://127.0.0.1:3021/api/scheme/export/geojson', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        context,
      )
    ).status,
  ).toBe(401)
  expect(executeSchemeExport).not.toHaveBeenCalled()
})
it('passes sharing intent through the real middleware without consuming its key-bearing stream', async () => {
  const intent = { projectId: project, expectedUserId: actor, requestId, exportRequestId: actor, snapshotHash: 'c'.repeat(64), durationDays: 7, authorityToShare: true, key: 'A'.repeat(43) }
  const req = new NextRequest(`http://127.0.0.1:3021/api/project/${project}/scheme/shares`, { method: 'POST', body: JSON.stringify(intent) }), json = jest.spyOn(req, 'json')
  expect((await sharePost(req, context)).status).toBe(200)
  expect(createParcelShare).toHaveBeenCalledWith(actor, project, intent)
  expect(json).not.toHaveBeenCalled()
})
it('requires authenticated sharing and bounds its command before parsing', async () => {
  const url = `http://127.0.0.1:3021/api/project/${project}/scheme/shares`
  expect((await sharePost(new NextRequest(url, { method: 'POST', body: JSON.stringify({ padding: 'x'.repeat(9000) }) }), context)).status).toBe(413)
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await sharePost(new NextRequest(url, { method: 'POST', body: '{}' }), context)).status).toBe(401)
  expect(createParcelShare).not.toHaveBeenCalled()
})
