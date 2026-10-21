/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'
import { POST as geoTransform } from './route'
import { POST as legacyTransform } from '@/app/api/transform/route'
import { db } from '@/lib/db'
import { SRID_21037 } from '@/lib/map/projectionConstants'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (options: { auth: boolean; schema?: ZodSchema }, handler: (request: NextRequest, context: { body: unknown; userId: string }) => Promise<NextResponse>) => async (request: NextRequest) => {
  if (!options.auth) throw new Error('Transforms must require authentication')
  const body: unknown = await request.json()
  return handler(request, { body: options.schema ? options.schema.parse(body) : body, userId: 'synthetic-transform-user' })
} }))
beforeEach(() => jest.mocked(db.query).mockReset().mockResolvedValue([] as never))

describe.each([{ name: 'geo', run: geoTransform, key: 'points' }, { name: 'legacy', run: legacyTransform, key: 'coordinates' }])('$name transform boundary', ({ run, key }) => {
  const submit = (points: unknown[], fromCRS = 'WGS84', toCRS = 'WGS84-UTM37S') => run(new NextRequest('http://127.0.0.1/api/geo/transform', { method: 'POST', body: JSON.stringify({ [key]: points, fromCRS, toCRS }) }))

  test('invalid geographic coordinates return an actionable 422 before success logging', async () => {
    const response = await submit([{ id: 'bad', x: 36, y: 91 }])
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'COORDINATE_TRANSFORM_REJECTED' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('the documented EPSG pair transforms without persisting coordinate records', async () => {
    const response = await submit([{ id: 'p', x: 36.817, y: -1.286 }], 'EPSG:4326', SRID_21037)
    expect(response.status).toBe(200)
    const payload = await response.json() as { points?: { x: number; y: number }[]; results?: { x: number; y: number }[] }
    const point = (payload.points ?? payload.results)?.[0]
    expect(point?.x).toBeGreaterThan(250000)
    expect(point?.y).toBeGreaterThan(9800000)
    if (key === 'points') expect(db.query).toHaveBeenCalledTimes(1)
    else expect(db.query).not.toHaveBeenCalled()
  })

  test('an explicitly unknown height stays null and the response declares horizontal-only treatment', async () => {
    const response = await submit([{ id: 'p', x: 0, y: 0, z: null }], 'EPSG:4326', 'EPSG:4326')
    expect(response.status).toBe(200)
    const payload = await response.json() as { points?: { z: unknown }[]; results?: { z: unknown }[] }
    expect((payload.points ?? payload.results)?.[0].z).toBeNull()
    expect(payload).toMatchObject({ horizontalOnly: true, verticalTreatment: 'preserved-untransformed' })
  })
})
