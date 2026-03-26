import { cleanSurveyData } from '@/lib/compute/dataCleaner'

describe('FieldGuard Data Cleaner', () => {
  test('cleans noisy GNSS points', async () => {
    const points = [
      { id: '1', easting: 500000, northing: 5000000, elevation: 100 },
      { id: '2', easting: 500001, northing: 5000001, elevation: 101 },
      { id: '3', easting: 500050, northing: 5000050, elevation: 200 }
    ]
    
    const result = await cleanSurveyData(points, 'gnss')
    
    expect(result.cleaned_points.length).toBe(3)
    expect(result.summary.total_points).toBe(3)
    expect(result.anomalies.length).toBeGreaterThan(0)
  })
  
  test('returns summary with metrics', async () => {
    const points = [
      { easting: 500000, northing: 5000000, elevation: 100 },
      { easting: 500001, northing: 5000001, elevation: 101 },
      { easting: 500002, northing: 5000002, elevation: 102 }
    ]
    
    const result = await cleanSurveyData(points, 'gnss')
    
    expect(result.summary).toHaveProperty('total_points')
    expect(result.summary).toHaveProperty('outliers_removed')
    expect(result.summary).toHaveProperty('confidence_avg')
    expect(result.confidence_scores).toBeDefined()
  })
})