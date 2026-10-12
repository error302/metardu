import { computeRasterAnalysis, validateRasterRequest } from '../rasterAnalysis'

const params = { elevation_grid: [[0, 2, 4], [3, 5, 7], [6, 8, 10]] }
const directionParams = { ...params, cell_size_x: 1, cell_size_y: 1, z_factor: 1, row_order: 'south_to_north' as const }

describe('DEM grid analysis', () => {
  it('computes statistics from actual cells and never reports empty input as computed', async () => {
    await expect(computeRasterAnalysis({ project_id: 'p1', analysis_type: 'statistics', params }))
      .resolves.toMatchObject({ status: 'computed', data: { min_elevation: 0, max_elevation: 10, mean_elevation: 5, cell_count: 9 } })
    await expect(computeRasterAnalysis({ project_id: 'p1', analysis_type: 'statistics', params: {} }))
      .resolves.toMatchObject({ status: 'unavailable', message: expect.stringContaining('elevation_grid') })
  })

  it('computes Horn slope and compass aspect for a planar surface', async () => {
    const slope = await computeRasterAnalysis({ project_id: 'p1', analysis_type: 'slope', params: directionParams })
    const aspect = await computeRasterAnalysis({ project_id: 'p1', analysis_type: 'aspect', params: directionParams })
    expect(slope.status).toBe('computed')
    expect(aspect.status).toBe('computed')
    const slopeData = slope.data as { slope_degrees: Array<Array<number | null>>; slope_percent: Array<Array<number | null>> }
    const aspectData = aspect.data as { aspect_degrees_clockwise_from_north: Array<Array<number | null>> }
    expect(slopeData.slope_degrees[1][1]).toBeCloseTo(Math.atan(Math.sqrt(13)) * 180 / Math.PI, 6)
    expect(slopeData.slope_percent[1][1]).toBeCloseTo(Math.sqrt(13) * 100, 6)
    expect(aspectData.aspect_degrees_clockwise_from_north[1][1]).toBeCloseTo((Math.atan2(-2, -3) * 180 / Math.PI + 360) % 360, 6)
    expect(slopeData.slope_degrees[0][0]).toBeNull()
  })

  it('computes hillshade and contour segments in explicit grid space', async () => {
    const hillshade = await computeRasterAnalysis({ project_id: 'p1', analysis_type: 'hillshade', params: directionParams })
    const contours = await computeRasterAnalysis({ project_id: 'p1', analysis_type: 'contour', params: { elevation_grid: [[0, 2], [0, 2]], contour_interval: 1 } })
    expect(hillshade.status).toBe('computed')
    expect((hillshade.data as { values_0_to_255: Array<Array<number | null>> }).values_0_to_255[1][1]).toEqual(expect.any(Number))
    expect(contours.status).toBe('computed')
    const contourData = contours.data as { segment_count: number; coordinate_space: string; segments: Array<{ elevation: number; start: { row: number; column: number }; end: { row: number; column: number } }> }
    expect(contourData.segment_count).toBeGreaterThan(0)
    expect(contourData.coordinate_space).toContain('no map origin or CRS')
    expect(contourData.segments.every(segment => Number.isFinite(segment.elevation) && Number.isFinite(segment.start.row) && Number.isFinite(segment.end.column))).toBe(true)
  })

  it('requires orientation, cell dimensions, and project identity where the result depends on them', async () => {
    await expect(computeRasterAnalysis({ project_id: 'p1', analysis_type: 'aspect', params: params }))
      .resolves.toMatchObject({ status: 'unavailable', message: expect.stringContaining('cell_size_x') })
    await expect(computeRasterAnalysis({ project_id: '', analysis_type: 'statistics', params }))
      .resolves.toMatchObject({ status: 'unavailable', message: expect.stringContaining('project identifier') })
    expect(validateRasterRequest({ analysis_type: 'statistics', params: [] })).toMatchObject({ params: {} })
    expect(validateRasterRequest({ analysis_type: 'unsupported' })).toBeNull()
  })
})
