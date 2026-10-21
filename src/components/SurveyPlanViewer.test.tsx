import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SurveyPlanViewer from './SurveyPlanViewer'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'

const data: SurveyPlanData = {
  project: { name: 'Fictional pagination fixture', location: '', utm_zone: 37, hemisphere: 'S', datum: 'WGS84', totalSheets: '99' },
  parcel: { boundaryPoints: Array.from({ length: 80 }, (_, index) => ({ name: `Station-${index + 1}`, easting: 500000 + 20 * Math.cos(index * Math.PI / 40), northing: 9900000 + 20 * Math.sin(index * Math.PI / 40) })), area_sqm: 1255.345, perimeter_m: 125.631 },
  controlPoints: [],
}

test('page controls show one actual sheet and reset to the drawing when the layout changes', async () => {
  const { container } = render(<SurveyPlanViewer data={data} />)
  const next = await screen.findByRole('button', { name: 'Next plan sheet' })
  expect(screen.getByRole('button', { name: 'Previous plan sheet' })).toBeDisabled()
  expect(container.querySelectorAll('.survey-plan-sheet')).toHaveLength(1)
  expect(container.querySelector('.survey-plan-sheet polygon')).not.toBeNull()
  fireEvent.click(next)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Previous plan sheet' })).toBeEnabled())
  expect(container.querySelectorAll('.survey-plan-sheet')).toHaveLength(1)
  expect(container.querySelector('.survey-plan-sheet polygon')).toBeNull()
  expect(container.querySelector('.survey-plan-sheet')?.textContent).toContain('Schedule continuation')
  fireEvent.click(screen.getByRole('button', { name: 'Form No. 4 (Kenya)' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Previous plan sheet' })).toBeDisabled())
  expect(container.querySelector('.survey-plan-sheet polygon')).not.toBeNull()
})
