/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ db: {}, setCurrentUserId: jest.fn(), setCurrentOrgId: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: jest.fn(), getClientIdentifier: jest.fn() }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (path: string) => path }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))

const route = apiHandler({ auth: false }, async (_req, ctx) => NextResponse.json(ctx.params))
// Next 15 validates the exported handler's last call signature this way.
type ValidateNextRouteContext<T extends { params: Promise<Record<string, string | string[]>> }> = T
type NextRouteContext = ValidateNextRouteContext<NonNullable<Parameters<typeof route>[1]>>

test('awaits Next 15 promised params before exposing identifiers to handlers', async () => {
  const response = await route(new NextRequest('http://localhost/api/projects/project-a'), {
    params: Promise.resolve({ id: 'project-a', path: ['first', 'second'] }),
  } satisfies NextRouteContext)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ id: 'project-a', path: 'first' })
})

test('retains plain-object params for existing callers', async () => {
  const response = await route(new NextRequest('http://localhost/api/projects/project-a'), {
    params: { id: 'project-a', path: ['first', 'second'] },
  })
  expect(await response.json()).toEqual({ id: 'project-a', path: 'first' })
})

test('POST routes receive the parsed payload after the request stream is consumed', async () => {
  const echo = apiHandler({ auth: false }, async (req, ctx) => NextResponse.json({
    payload: ctx.body, requestStreamConsumed: req.bodyUsed,
  }))
  const payload = { action: 'save_drainage_definition' }
  const response = await echo(new NextRequest('http://localhost/api/field-action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ payload, requestStreamConsumed: true })
})
