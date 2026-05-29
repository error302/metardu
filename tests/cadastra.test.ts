// tests/cadastra.test.ts

import { validateBoundary } from '@/lib/compute/cadastraValidator'

describe('CadastraAI Validator', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        validation: {
          score: 85,
          overlaps: [],
          gaps: [],
          summary: {
            total_overlap_area: 0,
            total_gap_area: 0,
            risk_level: 'low',
            boundary_area: 10000
          }
        }
      })
    }) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
  
  test('validates boundary and returns score', async () => {
    const boundary = {
      points: [
        { easting: 0, northing: 0 },
        { easting: 100, northing: 0 },
        { easting: 100, northing: 100 },
        { easting: 0, northing: 100 }
      ]
    }
    
    const result = await validateBoundary('project-1', boundary)
    
    expect(result.validation.score).toBe(85)
    expect(result.validation.summary.risk_level).toBe('low')
  })
  
  test('returns summary metrics', async () => {
    const boundary = {
      points: [
        { easting: 0, northing: 0 },
        { easting: 100, northing: 0 },
        { easting: 100, northing: 100 },
        { easting: 0, northing: 100 }
      ]
    }
    
    const result = await validateBoundary('project-1', boundary)
    
    expect(result.validation.summary).toHaveProperty('boundary_area')
    expect(result.validation.summary).toHaveProperty('total_overlap_area')
    expect(result.validation.summary).toHaveProperty('total_gap_area')
  })
})
