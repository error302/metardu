/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST } from './route'
import type { VerticalCurveResult } from '@/lib/computations/roadDesignEngine'
import type { SpiralAlignmentResult } from '@/lib/survey/curves/spiralAlignment'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const vertical = { curveType: 'vertical', g1: -2, g2: 4, vpiChainage: 1003, vpiRL: 100, curveLength: 200, interval: 37 }
const transition = { curveType: 'transition', radius: 300, intersectionAngleDeg: 70, spiralLength: 60, piChainage: 1000, interval: 17 }
const request = (input: unknown) => new NextRequest('http://127.0.0.1/api/engineering/compute/curve', { method: 'POST', body: JSON.stringify(input) })
type VerticalResponse = { contractVersion: number; geometry: VerticalCurveResult; reference: { verticalDatum: null }; standardCompliance: string }
type TransitionResponse = { contractVersion: number; geometry: SpiralAlignmentResult; standardCompliance: string; reference: { kind: string; horizontalCrs: null }; stations: { chainage: number; distanceFromTS: number; x: number; y: number; tangentDeflectionDeg: number }[] }
beforeEach(() => jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-source-caller' } }))

test('vertical API retains supplied absolute levels, exact endpoints and sag minimum', async () => {
  const response = await POST(request(vertical))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const body = await response.json() as VerticalResponse
  expect(body.contractVersion).toBe(2)
  expect(body.geometry.bvcChainage).toBe(903)
  expect(body.geometry.evcChainage).toBe(1103)
  expect(body.geometry.bvcRL).toBe(102)
  expect(body.geometry.evcRL).toBe(104)
  expect(body.geometry.chainagePeak).toBeCloseTo(969.6666666667, 8)
  expect(body.geometry.rlPeak).toBeCloseTo(101.3333333333, 8)
  expect(body.geometry.rows[0].chainage).toBe(903)
  expect(body.geometry.rows.at(-1)?.chainage).toBe(1103)
  expect(body.standardCompliance).toBe('NOT_ASSESSED')
  expect(body.reference.verticalDatum).toBeNull()
})

test.each([0, -10])('vertical API preserves a supplied VPI level of %s', async vpiRL => {
  const response = await POST(request({ ...vertical, vpiRL, vpiChainage: 0 }))
  expect(response.status).toBe(200)
  const body = await response.json() as VerticalResponse
  expect(body.geometry.bvcRL).toBe(vpiRL + 2)
  expect(body.geometry.evcRL).toBe(vpiRL + 4)
  expect(body.geometry.bvcChainage).toBe(-100)
})

test('declared K uses metres per percent without an invented radius conversion', async () => {
  const { curveLength: _length, ...input } = vertical
  const response = await POST(request({ ...input, kValue: 200 / 6 }))
  expect(response.status).toBe(200)
  const body = await response.json() as VerticalResponse
  expect(body.geometry.L).toBeCloseTo(200, 10)
  expect(body.geometry.K).toBeCloseTo(33.3333333333, 8)
})

test('equal grades produce an explicit straight profile and no fabricated stationary point', async () => {
  const response = await POST(request({ ...vertical, g1: 2, g2: 2 }))
  expect(response.status).toBe(200)
  const body = await response.json() as VerticalResponse
  expect(body.geometry.curveType).toBe('straight')
  expect(body.geometry.K).toBeNull()
  expect(body.geometry.rlPeak).toBeNull()
})

test.each([
  { curveType: 'vertical', R: 5000, g1: -2, g2: 4, chainageStart: 903, designSpeed: 80 },
  { ...vertical, vpiRL: undefined }, { ...vertical, vpiChainage: undefined },
  { ...vertical, curveLength: undefined }, { ...vertical, kValue: 30 },
  { ...vertical, interval: 0 }, { ...vertical, interval: 1e-10 },
  { ...vertical, curveLength: 1e-300 }, { ...vertical, g1: 1e308, g2: -1e308 },
  { ...vertical, vpiRL: null }, { ...vertical, verticalDatum: 'guessed' },
  { ...vertical, vpiRL: 1e30 },
])('vertical API refuses missing, ambiguous or unrepresentable geometry: %j', async input => {
  const response = await POST(request(input))
  expect(response.status).toBe(400)
  expect(await response.json()).not.toHaveProperty('geometry')
})

test.each([70, -70])('transition API samples both clothoids and signed end heading for angle %s', async intersectionAngleDeg => {
  const response = await POST(request({ ...transition, intersectionAngleDeg }))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const body = await response.json() as TransitionResponse
  expect(body.contractVersion).toBe(2)
  expect(body.geometry.Lc).toBeCloseTo(306.5191429188, 8)
  expect(body.geometry.totalLength).toBeCloseTo(426.5191429188, 8)
  expect(body.geometry.T).toBeCloseTo(240.402242998797, 8)
  expect(body.geometry.tsChainage).toBeCloseTo(759.597757001203, 8)
  expect(body.stations[0]).toMatchObject({ distanceFromTS: 0, x: 0, y: 0 })
  expect(body.stations.at(-1)?.tangentDeflectionDeg).toBeCloseTo(intersectionAngleDeg, 10)
  expect(body.stations.at(-1)?.x).toBeCloseTo(322.624652605058, 8)
  expect(body.stations.at(-1)?.y).toBeCloseTo(Math.sign(intersectionAngleDeg) * 225.904213766350, 8)
  expect(body.stations.some(row => row.distanceFromTS === 60)).toBe(true)
  expect(body.stations.some(row => Math.abs(row.distanceFromTS - 366.51914291880917) < 1e-8)).toBe(true)
  expect(body.reference).toMatchObject({ kind: 'local', horizontalCrs: null })
  expect(body.standardCompliance).toBe('NOT_ASSESSED')
  expect(body.stations[0]).not.toHaveProperty('easting')
  expect(body.stations[0]).not.toHaveProperty('tangentBearingDeg')
})

test('explicit zero spiral length remains a finite circular limit', async () => {
  const response = await POST(request({ ...transition, radius: 100, intersectionAngleDeg: -60, spiralLength: 0, piChainage: 0 }))
  expect(response.status).toBe(200)
  const body = await response.json() as TransitionResponse
  expect(body.geometry.totalLength).toBeCloseTo(104.71975511966, 9)
  expect(body.stations.at(-1)?.x).toBeCloseTo(86.6025403784, 8)
  expect(body.stations.at(-1)?.y).toBeCloseTo(-50, 10)
})

test.each([
  { curveType: 'transition', R: 300, deltaDeg: 30, chainageStart: 0, designSpeed: 80 },
  { ...transition, spiralLength: undefined }, { ...transition, piChainage: undefined },
  { ...transition, spiralLength: 1000 }, { ...transition, spiralLength: -1 },
  { ...transition, intersectionAngleDeg: 180 }, { ...transition, intersectionAngleDeg: 0 },
  { ...transition, interval: 0 }, { ...transition, interval: 1e-10 },
  { ...transition, piChainage: 1e30 }, { ...transition, piEasting: 500000, piNorthing: 9900000 },
])('transition API refuses guessed or impossible stationing: %j', async input => {
  const response = await POST(request(input))
  expect(response.status).toBe(400)
  expect(await response.json()).not.toHaveProperty('geometry')
})

test.each([
  '{"curveType":"vertical","g1":-2,"g2":4,"vpiChainage":1003,"vpiRL":1e400,"curveLength":200}',
  '{"curveType":"transition","radius":1e400,"intersectionAngleDeg":70,"spiralLength":60,"piChainage":1000}',
])('JSON numeric overflow cannot become a null geometry value', async body => {
  const response = await POST(new NextRequest('http://127.0.0.1/api/engineering/compute/curve', { method: 'POST', body }))
  expect(response.status).toBe(400)
  expect(await response.json()).not.toHaveProperty('geometry')
})
