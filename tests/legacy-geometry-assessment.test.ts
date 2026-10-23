jest.mock('@/lib/geo/transform', () => ({ transformCoordinates: jest.fn() }))
jest.mock('@/lib/engine/contours', () => ({ generateContours: jest.fn() }))
import { validateGeometry } from '@/lib/compute/pythonService'

test('legacy local mock cannot report passing approval or Python verification', async () => {
  const result = await validateGeometry({ designSpeed: 80, terrain: 'rolling', gradient: 0, radius: 9999, ssd: 0 })
  expect(result.status).toBe('UNASSESSED')
  expect(result.source).toBe('not-assessed')
  expect(result.fallback).toBe(true)
  expect(result.flags.join(' ')).toMatch(/performs no validation/)
})
