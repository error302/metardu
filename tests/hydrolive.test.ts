import { processBathymetry } from '@/lib/compute/bathymetry'

describe('HydroLive Mapper', () => {
  const mockFetch = jest.fn()
  
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        contours: [{ elevation: 1, coordinates: [] }],
        volume_delta: { volume_change: 100, area_change: 50 },
        hazards: [{ id: '1', type: 'shallow', location: { easting: 0, northing: 0 }, depth: 1, severity: 'high', description: 'test' }],
        summary: { min_depth: 1, max_depth: 10, avg_depth: 5, area: 1000 }
      })
    })
    global.fetch = mockFetch
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
  
  test('processes bathymetry data successfully', async () => {
    const soundings = [
      { id: '1', easting: 0, northing: 0, depth: 5 },
      { id: '2', easting: 10, northing: 10, depth: 8 }
    ]
    
    const result = await processBathymetry('project-1', soundings)
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/hydro/process'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    )
    
    expect(result.contours).toHaveLength(1)
    expect(result.contours[0].elevation).toBe(1)
    expect(result.hazards).toHaveLength(1)
    expect(result.hazards[0].type).toBe('shallow')
    expect(result.volume_delta?.volume_change).toBe(100)
    expect(result.summary.min_depth).toBe(1)
    expect(result.summary.max_depth).toBe(10)
  })

  test('throws error on failed response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Processing failed' })
    })
    
    const soundings = [{ id: '1', easting: 0, northing: 0, depth: 5 }]
    
    await expect(processBathymetry('project-1', soundings)).rejects.toThrow('Processing failed')
  })
})
