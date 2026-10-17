import { act, fireEvent, render, screen } from '@testing-library/react'
import DashboardSearch from './DashboardSearch'

const mockPush = jest.fn<void, [string]>()
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const originalFetch = global.fetch
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const projectHit = { id: 'p1', type: 'projects', title: 'Ridge road survey', subtitle: 'engineering', score: 2.4 }
const response = (hits = [projectHit]) => ({ query: 'road', total: hits.length, results: [{ type: 'projects', total: hits.length, hits }] })
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
async function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  await act(async () => { jest.advanceTimersByTime(300) })
}

beforeEach(() => {
  jest.useFakeTimers()
  mockPush.mockReset()
  mockFetch.mockReset()
  global.fetch = mockFetch
  HTMLElement.prototype.scrollIntoView = jest.fn()
})
afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch })

it('renders the API grouped response and opens the real project route', async () => {
  mockFetch.mockResolvedValue(ok(response()))
  render(<DashboardSearch />)
  await typeQuery('road')
  fireEvent.click(screen.getByRole('button', { name: /Ridge road survey/ }))
  expect(mockPush).toHaveBeenCalledWith('/project/p1')
})

it.each(['new query', 'clear'])('discards an old request immediately on %s', async action => {
  let resolveOld!: (value: Response) => void
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  render(<DashboardSearch />)
  await typeQuery('old')
  const signal = mockFetch.mock.calls[0][1]?.signal as AbortSignal
  if (action === 'clear') fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  else fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new' } })
  expect(signal.aborted).toBe(true)
  await act(async () => { resolveOld(ok(response([{ ...projectHit, title: 'Old road survey' }]))) })
  fireEvent.focus(screen.getByRole('textbox'))
  expect(screen.queryByText('Old road survey')).not.toBeInTheDocument()
})

it('shows a retryable error for an invalid response instead of crashing or reporting no matches', async () => {
  mockFetch.mockResolvedValueOnce(ok({ results: {} })).mockResolvedValueOnce(ok(response()))
  render(<DashboardSearch />)
  await typeQuery('road')
  expect(screen.getByRole('alert')).toHaveTextContent('Search is temporarily unavailable')
  expect(screen.queryByText('No results found')).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry search' })) })
  expect(screen.getByRole('button', { name: /Ridge road survey/ })).toBeInTheDocument()
})

it('labels partial failure even when no available group has a match', async () => {
  mockFetch.mockResolvedValue(ok({ query: 'road', total: 0, results: [{ type: 'projects', total: 0, hits: [], unavailable: true }] }))
  render(<DashboardSearch />)
  await typeQuery('road')
  expect(screen.getByText('Search results are incomplete')).toBeInTheDocument()
  expect(screen.queryByText('No results found')).not.toBeInTheDocument()
})

it('opens submissions with their project context and sends surveyor names to the directory', async () => {
  mockFetch.mockResolvedValue(ok({ query: 'road', total: 2, results: [
    { type: 'submissions', total: 1, hits: [{ id: 's1', type: 'submissions', title: 'Road submission', score: 1, meta: { project_id: 'p1' } }] },
    { type: 'surveyors', total: 1, hits: [{ id: 'u1', type: 'surveyors', title: 'Amina Surveyor', score: 1 }] },
  ] }))
  render(<DashboardSearch />)
  await typeQuery('road')
  fireEvent.click(screen.getByRole('button', { name: /Road submission/ }))
  expect(mockPush).toHaveBeenLastCalledWith('/project/p1/submission')
  fireEvent.focus(screen.getByRole('textbox'))
  fireEvent.click(screen.getByRole('button', { name: /Amina Surveyor/ }))
  expect(mockPush).toHaveBeenLastCalledWith('/community/directory?q=Amina%20Surveyor')
})
