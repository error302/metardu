import { render, screen, waitFor } from '@testing-library/react'
import SurveyorDirectoryPage from './page'

let mockRouteQuery = 'q=Amina%20Surveyor'
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const originalFetch = global.fetch
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockRouteQuery) }))
jest.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => null }))

beforeEach(() => {
  mockRouteQuery = 'q=Amina%20Surveyor'
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as Response)
  global.fetch = mockFetch
})
afterEach(() => { global.fetch = originalFetch })

it('applies a selected search result to the directory and follows subsequent query navigation', async () => {
  const { rerender } = render(<SurveyorDirectoryPage />)
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/community/surveyors?limit=50&q=Amina+Surveyor'))
  expect(screen.getByRole('textbox', { name: 'Search surveyors' })).toHaveValue('Amina Surveyor')
  mockRouteQuery = 'q=Otieno'
  rerender(<SurveyorDirectoryPage />)
  await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('/api/community/surveyors?limit=50&q=Otieno'))
  expect(screen.getByRole('textbox', { name: 'Search surveyors' })).toHaveValue('Otieno')
})
