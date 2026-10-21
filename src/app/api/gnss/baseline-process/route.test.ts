/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'
import { callPythonCompute } from '@/lib/compute/pythonService'
import { POST } from './route'

jest.mock('@/lib/compute/pythonService', () => ({ callPythonCompute: jest.fn() }))
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (options: { auth: boolean; schema: ZodSchema }, handler: (request: NextRequest, context: { body: unknown }) => Promise<NextResponse>) => async (request: NextRequest) => {
  if (!options.auth) throw new Error('GNSS route must keep authentication enabled')
  return handler(request, { body: options.schema.parse(await request.json()) })
} }))

const measured = { rover_latitude: -1, rover_longitude: 36, rover_height: 100, sigma_east: 0.01, sigma_north: 0.02, sigma_up: 0.03, quality: 'FIX', sat_count: 12, ratio: 4 }
const input = { baseRinex: 'B'.repeat(120), roverRinex: 'R'.repeat(120), navRinex: 'N'.repeat(120), basePosition: { latitude: -1, longitude: 36, ellipsoidalHeight: 100 } }
const submit = () => POST(new NextRequest('http://127.0.0.1/api/gnss/baseline-process', { method: 'POST', body: JSON.stringify(input) }))
beforeEach(() => jest.mocked(callPythonCompute).mockReset())

test('valid relative worker measurements are returned with the submitted base and settings', async () => {
  jest.mocked(callPythonCompute).mockResolvedValue({ ok: true, value: measured })
  const response = await submit()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ baseline: measured, meta: { basePosition: input.basePosition, mode: 'static' } })
  expect(jest.mocked(callPythonCompute).mock.calls[0]).toMatchObject(['/compute', {
    task: 'gnss_baseline_process', params: { base_position: { latitude: -1, longitude: 36, ellipsoidal_height: 100 } },
  }, { timeoutMs: 330_000 }])
})

test.each([
  null, {}, { ...measured, quality: 'SINGLE' }, { ...measured, sigma_up: -1 },
  { ...measured, sat_count: 1.5 }, { ...measured, ratio: -1 },
  { ...measured, rover_latitude: 91 }, { ...measured, rover_height: Number.NaN },
])('invalid worker success payload is refused at the server boundary: %j', async value => {
  jest.mocked(callPythonCompute).mockResolvedValue({ ok: true, value })
  const response = await submit()
  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ code: 'INVALID_WORKER_RESULT' })
})

test('worker failures propagate without turning into a baseline', async () => {
  jest.mocked(callPythonCompute).mockResolvedValue({ ok: false, status: 503, error: 'Worker unavailable' })
  const response = await submit()
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ error: 'Worker unavailable', code: 'WORKER_ERROR' })
})

test('valid float and zero coordinates are retained while unrelated worker output is omitted', async () => {
  const baseline = { ...measured, quality: 'FLOAT', rover_latitude: 0, rover_longitude: 0, rover_height: 0, ratio: 0 }
  jest.mocked(callPythonCompute).mockResolvedValue({ ok: true, value: { ...baseline, raw_output: 'private worker debug output' } })
  const response = await submit()
  expect(response.status).toBe(200)
  const payload = await response.json() as { baseline: unknown }
  expect(payload.baseline).toEqual(baseline)
})
