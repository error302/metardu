/** @jest-environment node */
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ session: { user: { id: 'survey-user' } }, error: null }),
}))
jest.mock('@/lib/survey/pipeline/correction-pipeline', () => ({
  KENYA_DEFAULT_CONFIG: { applyConvergence: true },
  processObservation: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { processObservation } from '@/lib/survey/pipeline/correction-pipeline'
import { POST } from '../route'

const mockProcessObservation = processObservation as jest.Mock

function makeRequest(
  observation: Record<string, unknown>,
  overrides: {
    method?: 'bowditch' | 'least_squares'
    stations?: Record<string, unknown>[]
    observations?: Record<string, unknown>[]
  } = {}
) {
  const defaultStations = [
    { name: 'A', easting: 500000, northing: 9900000, isFixed: true },
    { name: 'B', easting: 500100, northing: 9900000, isFixed: true },
  ]
  return new NextRequest('http://localhost/api/survey/traverse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      observations: overrides.observations ?? [{ fromStation: 'A', toStation: 'B', rawSlopeDistance: 100, ...observation }],
      stations: overrides.stations ?? defaultStations,
      method: overrides.method ?? 'bowditch',
    }),
  })
}

describe('POST /api/survey/traverse input evidence', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects horizontal angles without an absolute true bearing', async () => {
    const response = await POST(makeRequest({ rawHorizontalAngle: 90, latitude: -1, longitude: 37 }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: 'Traverse observations are incomplete',
      details: [expect.stringContaining('true bearing is required')],
    })
    expect(mockProcessObservation).not.toHaveBeenCalled()
  })

  it('rejects convergence calculations without both geographic coordinates', async () => {
    const response = await POST(makeRequest({ trueBearing: 90, longitude: 37 }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: 'Traverse observations are incomplete',
      details: [expect.stringContaining('latitude and longitude are required')],
    })
    expect(mockProcessObservation).not.toHaveBeenCalled()
  })

  it('requires a measured slope distance instead of processing an absent value as zero', async () => {
    const request = new NextRequest('http://localhost/api/survey/traverse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        observations: [{ fromStation: 'A', toStation: 'B', trueBearing: 90, latitude: -1, longitude: 37 }],
        stations: [{ name: 'A', easting: 500000, northing: 9900000, isFixed: true }],
        method: 'bowditch',
      }),
    })
    const response = await POST(request)

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: 'Traverse observations are incomplete',
      details: [expect.stringContaining('measured slope distance is required')],
    })
    expect(mockProcessObservation).not.toHaveBeenCalled()
  })

  it('keeps angular closure explicitly unavailable after valid bearing-and-distance processing', async () => {
    mockProcessObservation.mockReturnValue({
      fromStation: 'A',
      toStation: 'B',
      rawSlopeDistance: 100,
      gridDistance: 100,
      trueBearing: 90,
      gridBearing: 90,
      warnings: [],
    })

    const response = await POST(makeRequest({ trueBearing: 90, latitude: -1, longitude: 37 }))

    expect(response.status).toBe(200)
    expect(mockProcessObservation).toHaveBeenCalledWith(
      expect.objectContaining({ trueBearing: 90, latitude: -1, longitude: 37 }),
      expect.objectContaining({ applyConvergence: true })
    )
    const body = await response.json() as unknown as {
      adjustmentResult: { misclosure: { angular: number | null }; warnings: string[] }
    }
    expect(body.adjustmentResult.misclosure.angular).toBeNull()
    expect(body.adjustmentResult.warnings).toContain(
      'Angular closure not assessed: provide independent angle observations or a closing azimuth check.'
    )
  })

  it('rejects least-squares adjustment when approximate coordinates are missing instead of substituting zero', async () => {
    const response = await POST(makeRequest(
      { trueBearing: 90, latitude: -1, longitude: 37 },
      {
        method: 'least_squares',
        stations: [
          { name: 'A', easting: 500000, northing: 9900000, isFixed: true },
          { name: 'B', isFixed: false },
        ],
      }
    ))

    expect(response.status).toBe(422)
    const body = await response.json() as unknown as { error: string; details: string[] }
    expect(body.error).toBe('Traverse station inputs are incomplete')
    expect(body.details).toContain('least-squares adjustment requires approximate easting and northing for every station')
    expect(mockProcessObservation).not.toHaveBeenCalled()
  })

  it('uses distance and absolute-bearing observations for a redundant least-squares network', async () => {
    mockProcessObservation.mockImplementation((observation: Record<string, number | string>) => ({
      ...observation,
      gridDistance: observation.rawSlopeDistance,
      gridBearing: observation.trueBearing,
      warnings: [],
    }))

    const response = await POST(makeRequest({}, {
      method: 'least_squares',
      stations: [
        { name: 'A', easting: 500000, northing: 9900000, isFixed: true },
        { name: 'B', easting: 500100, northing: 9900000, isFixed: false },
        { name: 'C', easting: 500100, northing: 9900100, isFixed: true },
      ],
      observations: [
        { fromStation: 'A', toStation: 'B', rawSlopeDistance: 100, trueBearing: 90, latitude: -1, longitude: 37 },
        { fromStation: 'B', toStation: 'C', rawSlopeDistance: 100, trueBearing: 0, latitude: -1, longitude: 37 },
      ],
    }))

    expect(response.status).toBe(200)
    const body = await response.json() as unknown as {
      adjustmentResult: {
        degreesOfFreedom: number
        residuals: Array<{ observation: { type: string } }>
      }
    }
    expect(body.adjustmentResult.degreesOfFreedom).toBe(2)
    expect(body.adjustmentResult.residuals.map(item => item.observation.type)).toEqual([
      'distance', 'azimuth', 'distance', 'azimuth',
    ])
  })
})
