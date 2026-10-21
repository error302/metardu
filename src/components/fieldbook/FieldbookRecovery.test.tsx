import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FieldbookRecovery } from './FieldbookRecovery'
import { listBookEdits, sendBookEdit } from '@/lib/offline/bookEdits'
import { getPendingOperations } from '@/lib/offline/syncQueue'
import { readReviewedBook } from '@/lib/fieldbook/deliveryClient'
jest.mock('@/lib/offline/bookEdits', () => ({ listBookEdits: jest.fn(), sendBookEdit: jest.fn(), exportBookEditRecords: jest.fn(async () => []) }))
jest.mock('@/lib/offline/bookDeliveryJournal', () => ({ exportBookRequestRecords: jest.fn(async () => []) }))
jest.mock('@/lib/offline/syncQueue', () => ({ getPendingOperations: jest.fn() }))
jest.mock('@/lib/fieldbook/deliveryClient', () => ({ readReviewedBook: jest.fn() }))
const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', book = '33333333-3333-4333-8333-333333333333'
const edit = { requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId: book, name: 'Morning run', type: 'leveling' as const, data: { bs: '1.5000' }, basis: { kind: 'unknown' as const } }
const props = () => ({ actorId: actor, projectId: project, refreshKey: 0, onOpen: jest.fn(async () => {}), onReviewed: jest.fn(async () => {}), onCount: jest.fn() })
beforeEach(() => { jest.resetAllMocks(); jest.mocked(listBookEdits).mockResolvedValue([{ edit, result: null }]); jest.mocked(getPendingOperations).mockResolvedValue([]) })
test('pending work is visible and a failed retry retains it without reporting delivery', async () => {
  jest.mocked(sendBookEdit).mockRejectedValue(new Error('Review both versions before retrying'))
  render(<FieldbookRecovery {...props()} />)
  expect(await screen.findByText('Morning run')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry delivery' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Review both versions')
  expect(screen.getByText('Morning run')).toBeInTheDocument()
})
test('a new server baseline requires visible comparison and explicit review before reopening the local edit', async () => {
  const input = props()
  jest.mocked(readReviewedBook).mockResolvedValue({ id: book, user_id: actor, project_id: project, type: 'leveling', name: 'Server run', data: { bs: '2.0000' }, status: 'active', revision: '12', created_at: null, updated_at: null })
  render(<FieldbookRecovery {...input} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Compare with server' }))
  const useRevision = await screen.findByRole('button', { name: 'Open local copy with reviewed revision' })
  expect(useRevision).toBeDisabled()
  expect(screen.getByText(/1.5000/)).toBeInTheDocument(); expect(screen.getByText(/2.0000/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed both copies/ }))
  fireEvent.click(useRevision)
  await waitFor(() => expect(input.onReviewed).toHaveBeenCalledWith(expect.objectContaining({ id: book, data: edit.data }), '12'))
})
test('legacy operations stay visible without an unversioned retry button', async () => {
  jest.mocked(listBookEdits).mockResolvedValue([])
  jest.mocked(getPendingOperations).mockResolvedValue([{ id: 3, type: 'UPSERT', table: 'fieldbooks', timestamp: '2026-10-21T08:00:00Z', projectId: project, retries: 3, priority: 'normal',
    data: { id: book, user_id: actor, project_id: project, type: 'leveling', name: 'Legacy run', data: { bs: '1.5000' } } }])
  render(<FieldbookRecovery {...props()} />)
  expect(await screen.findByText('Legacy run')).toBeInTheDocument()
  expect(screen.getByText(/Legacy operation/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry delivery' })).not.toBeInTheDocument()
})
test('an unreadable owned legacy record remains counted and directs the user to its archive', async () => {
  const input = props()
  jest.mocked(listBookEdits).mockResolvedValue([])
  jest.mocked(getPendingOperations).mockResolvedValue([{ id: 9, type: 'UPSERT', table: 'fieldbooks', timestamp: '2026-10-21T08:00:00Z', projectId: project, retries: 3, priority: 'normal', data: { user_id: actor, project_id: project, opaque: 'Retain this unknown source' } }])
  render(<FieldbookRecovery {...input} />)
  expect(await screen.findByText(/1 older record could not be opened/)).toBeInTheDocument()
  await waitFor(() => expect(input.onCount).toHaveBeenCalledWith(1))
})
