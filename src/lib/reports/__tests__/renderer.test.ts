import { SurveyPlanRenderer } from '../surveyPlan/renderer'
import { SurveyPlanData } from '../surveyPlan/types'

describe('SurveyPlanRenderer', () => {
  const mockData: SurveyPlanData = {
    project: {
      name: 'TEST PROJECT',
      location: 'NYERI',
      utm_zone: 37,
      hemisphere: 'S',
      datum: 'ARC1960',
      area_sqm: 5000,
      area_ha: 0.5,
    },
    parcel: {
      boundaryPoints: [
        { name: 'P1', easting: 250000, northing: 9945000 },
        { name: 'P2', easting: 250050, northing: 9945000 },
        { name: 'P3', easting: 250050, northing: 9945050 },
        { name: 'P4', easting: 250000, northing: 9945050 },
      ],
      area_sqm: 2500,
      perimeter_m: 200,
    },
    controlPoints: [],
  }

  it('renders a valid SVG that matches the snapshot', () => {
    const renderer = new SurveyPlanRenderer(mockData, {
      paperSize: 'a3',
      includeGrid: true,
      includePanel: true
    })
    const svg = renderer.render()
    
    expect(svg).toBeDefined()
    expect(svg).toContain('<svg')
    expect(svg).toContain('TEST PROJECT')
    expect(svg).toContain('NYERI')
    
    // Quality Hardening: Snapshots ensure layout consistency
    expect(svg).toMatchSnapshot()
  })

  it('handles empty control points gracefully', () => {
    const renderer = new SurveyPlanRenderer(mockData)
    const svg = renderer.render()
    expect(svg).toContain('COORDINATE SCHEDULE')
  })
})
