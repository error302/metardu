import { act, fireEvent, render, screen } from '@testing-library/react'
import { ActivityFeed } from './ActivityFeed'

const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const originalFetch = global.fetch
const activity = { id: 'a1', project_id: 'p1', activity_type: 'project_created', entity_type: 'project', description: 'Ridge survey created', created_at: '2026-10-18T00:00:00Z' }
// GET /api/activity uses apiSuccess({ activities, pagination }), without an envelope.
const ok = (activities: unknown) => ({ ok: true, json: async () => ({ activities, pagination: { limit: 10, offset: 0, total: Array.isArray(activities) ? activities.length : 0 } }) }) as Response

beforeEach(() => { jest.useFakeTimers(); mockFetch.mockReset(); global.fetch = mockFetch })
afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch })

it('retains the last loaded activity while polling and after a failed refresh', async () => {
  let rejectPoll!: (error: Error) => void
  mockFetch.mockResolvedValueOnce(ok([activity])).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPoll = reject }))
  render(<ActivityFeed />)
  await act(async () => {})
  expect(screen.getByRole('link', { name: /Ridge survey created/ })).toHaveAttribute('href', '/project/p1')
  await act(async () => { jest.advanceTimersByTime(30_000) })
  expect(screen.getByText(activity.description)).toBeInTheDocument()
  expect(screen.queryByLabelText('Loading recent activity')).not.toBeInTheDocument()
  await act(async () => { rejectPoll(new Error('Offline')) })
  expect(screen.getByRole('status')).toHaveTextContent('could not be refreshed')
  expect(screen.getByText(activity.description)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /View all/ })).not.toBeInTheDocument()
})

it('does not turn a malformed response into an empty activity claim and supports retry', async () => {
  mockFetch.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(ok([activity]))
  render(<ActivityFeed />)
  await act(async () => {})
  expect(screen.getByRole('status')).toHaveTextContent('could not be refreshed')
  expect(screen.queryByText('No recent activity')).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry activity' })) })
  expect(screen.getByText(activity.description)).toBeInTheDocument()
})

it('aborts the pending activity request when the widget unmounts', () => {
  mockFetch.mockReturnValue(new Promise(() => {}))
  const { unmount } = render(<ActivityFeed />)
  const signal = mockFetch.mock.calls[0][1]?.signal as AbortSignal
  unmount()
  expect(signal.aborted).toBe(true)
})
