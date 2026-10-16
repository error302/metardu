import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FeedbackInbox from '../FeedbackInbox'
const mockPatch = jest.fn<Promise<unknown>, unknown[]>()
jest.mock('@/lib/api/client', () => ({ apiPatch: (...args: unknown[]) => mockPatch(...args), ApiError: class extends Error {} }))
const items = [{ id: '90000000-0000-4000-8000-000000000001', type: 'bug', message: 'Map does not fit the survey points', email: 'surveyor@example.com', status: 'open', createdAt: '2026-10-15T00:00:00Z', resolutionNote: null }]
beforeEach(() => mockPatch.mockReset())
it('requires a review note and sends the last observed status when resolving', async () => {
  const updated = jest.fn().mockResolvedValue(undefined); mockPatch.mockResolvedValue({ id: items[0].id, status: 'resolved' })
  render(<FeedbackInbox items={items} onUpdated={updated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Review' }))
  expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } })
  fireEvent.change(screen.getByLabelText('Internal review note'), { target: { value: 'Fixed extent calculation' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save review' }))
  await waitFor(() => expect(updated).toHaveBeenCalledTimes(1))
  expect(mockPatch).toHaveBeenCalledWith('/api/admin/feedback', expect.anything(), { id: items[0].id, expectedStatus: 'open', status: 'resolved', note: 'Fixed extent calculation' })
  expect(screen.getByRole('status')).toHaveTextContent('audit trail')
})
it('keeps the report and note available after a failed update', async () => {
  mockPatch.mockRejectedValue(new Error('offline'))
  render(<FeedbackInbox items={items} onUpdated={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Review' }))
  fireEvent.change(screen.getByLabelText('Internal review note'), { target: { value: 'Review needed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save review' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update feedback')
  expect(screen.getByLabelText('Internal review note')).toHaveValue('Review needed')
})
