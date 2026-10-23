/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST } from './route'
import type { HorizontalCurveResult } from '@/lib/engineering/compute'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const geometry = { R: 100, deltaDeg: 60, chainageStart: 500 }
const request = (body: unknown) => new NextRequest('http://127.0.0.1/api/engineering/compute/curve', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-caller' } }))

test.each([undefined, 'horizontal'])('registered %s request returns exact shared stationing and chords', async curveType => {
  const response = await POST(request({ ...geometry, ...(curveType ? { curveType } : {}) }))
  expect(response.status).toBe(200)
  const body = await response.json() as HorizontalCurveResult
  expect(body.chainage_TC).toBeCloseTo(442.264973081, 9)
  expect(body.settingOutTable.find(row => row.chainage === 480)?.chordIncrement).toBeCloseTo(19.966683329, 9)
})

test.each([
  { R: 100, deltaDeg: 60 },
  { ...geometry, curveType: 'unrecognized' },
  { ...geometry, curveType: 'transition', designSpeed: 'invalid' },
  { ...geometry, deltaDeg: 180 },
  { ...geometry, R: 1e-300 },
])('malformed, missing or unrepresentable inputs never return a substitute curve: %j', async input => {
  const response = await POST(request(input))
  expect(response.status).toBe(400)
  expect(await response.json()).not.toHaveProperty('settingOutTable')
})

test('signed PI stationing is preserved at the API boundary', async () => {
  const response = await POST(request({ ...geometry, curveType: 'horizontal', chainageStart: -100 }))
  expect(response.status).toBe(200)
  expect((await response.json() as HorizontalCurveResult).chainage_TC).toBeCloseTo(-157.735026919, 9)
})

test('anonymous admission remains refused', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await POST(request(geometry))).status).toBe(401)
})

test('malformed JSON is an invalid request and never a server failure', async () => {
  const response = await POST(new NextRequest('http://127.0.0.1/api/engineering/compute/curve', { method: 'POST', body: '{' }))
  expect(response.status).toBe(400)
})
