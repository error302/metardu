import { act, fireEvent, render, screen } from '@testing-library/react'
import VerifyStagePanel from '../VerifyStagePanel'

jest.mock('@/components/dashboard/QADashboard', () => ({ QADashboard: () => null }))
const originalFetch = global.fetch
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>()
const event = { id: 'event-1', project_id: 'p1', entity_type: 'observation_batch', entity_id: 'batch-1', event_type: 'CREATED', details: {}, user_id: 'owner', event_hash: 'a'.repeat(64), previous_hash: null, created_at: '2026-10-24T12:00:00Z' }
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response
beforeEach(() => { mockFetch.mockReset(); global.fetch = mockFetch })
afterEach(() => { global.fetch = originalFetch })
async function openLedger() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Evidence Ledger/ })) })
}

test('reads the unwrapped evidence endpoint and renders its saved event', async () => {
  mockFetch.mockResolvedValue(response({ events: [event] }))
  render(<VerifyStagePanel projectId="p1" projectName="Synthetic survey" />)
  await openLedger()
  expect(screen.getByText('#1 CREATED')).toBeInTheDocument()
  expect(screen.getByText(`Event Hash: ${event.event_hash}`)).toBeInTheDocument()
})

test.each([null, {}, { events: {} }, { events: [{ ...event, project_id: 'another-project' }] }])('invalid or foreign evidence never becomes an empty timeline (%j)', async payload => {
  mockFetch.mockResolvedValue(response(payload))
  render(<VerifyStagePanel projectId="p1" projectName="Synthetic survey" />)
  await openLedger()
  expect(screen.getByRole('alert')).toHaveTextContent('Evidence could not be loaded')
  expect(screen.queryByText(/No evidence events recorded/)).not.toBeInTheDocument()
})

test('keeps the last confirmed events after refresh failure and supports retry', async () => {
  mockFetch.mockResolvedValueOnce(response({ events: [event] })).mockRejectedValueOnce(new Error('Synthetic offline')).mockResolvedValueOnce(response({ events: [] }))
  render(<VerifyStagePanel projectId="p1" projectName="Synthetic survey" />)
  await openLedger()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' })) })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByText('#1 CREATED')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry evidence' })) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText(/No evidence events recorded/)).toBeInTheDocument()
})

test('a project switch aborts the old request and never displays its late events', async () => {
  let finish!: (value: Response) => void
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(response({ events: [] }))
  const view = render(<VerifyStagePanel projectId="p1" projectName="First survey" />)
  await openLedger()
  const oldSignal = mockFetch.mock.calls[0][1]?.signal
  view.rerender(<VerifyStagePanel projectId="p2" projectName="Second survey" />)
  await act(async () => {})
  expect(oldSignal?.aborted).toBe(true)
  await act(async () => { finish(response({ events: [event] })) })
  expect(screen.queryByText('#1 CREATED')).not.toBeInTheDocument()
  expect(screen.getByText(/No evidence events recorded/)).toBeInTheDocument()
})
