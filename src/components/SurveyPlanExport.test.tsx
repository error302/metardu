import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SurveyPlanExport from './SurveyPlanExport'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'

const mockSvg = jest.fn<Promise<void>, [SVGSVGElement, { x: number; y: number; width: number; height: number }]>().mockResolvedValue(undefined)
const mockAddPage = jest.fn()
const mockSave = jest.fn()
jest.mock('svg2pdf.js', () => ({}))
jest.mock('jspdf', () => ({ jsPDF: jest.fn().mockImplementation(() => ({ svg: mockSvg, addPage: mockAddPage, save: mockSave })) }))

const data: SurveyPlanData = {
  project: { name: 'Fictional print fixture', location: '', utm_zone: 37, hemisphere: 'S', datum: 'WGS84', totalSheets: '3' },
  parcel: { boundaryPoints: [{ name: 'A', easting: 500000, northing: 9900000 }, { name: 'B', easting: 500020, northing: 9900000 }, { name: 'C', easting: 500020, northing: 9900040 }], area_sqm: 400, perimeter_m: 104.721 },
  controlPoints: [],
}

beforeEach(() => jest.clearAllMocks())

test('exports recorded standard sheets on separate A3 pages at full physical size', async () => {
  render(<SurveyPlanExport data={data} layout="standard" />)
  fireEvent.click(screen.getByRole('button', { name: 'Unsigned PDF' }))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockAddPage).toHaveBeenCalledTimes(2)
  expect(mockAddPage).toHaveBeenCalledWith('a3', 'landscape')
  expect(mockSvg).toHaveBeenCalledTimes(3)
  for (const [svg, dimensions] of mockSvg.mock.calls) {
    expect(svg.getAttribute('width')).toBe('420mm')
    expect(svg.getAttribute('height')).toBe('297mm')
    expect(dimensions).toEqual({ x: 0, y: 0, width: 420, height: 297 })
  }
})

test('exports the selected Form No. 4 layout as its single recorded sheet', async () => {
  render(<SurveyPlanExport data={data} layout="form4" />)
  fireEvent.click(screen.getByRole('button', { name: 'Unsigned PDF' }))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockAddPage).not.toHaveBeenCalled()
  expect(mockSvg).toHaveBeenCalledTimes(1)
  expect(mockSvg.mock.calls[0][0].textContent).toContain('Form No. 4')
})
