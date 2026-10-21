import { prepareWorkingBook } from './openWorkingBook'
import { readReviewedBook, BookDeliveryError } from './deliveryClient'
import { readBookEdit } from '@/lib/offline/bookEdits'
jest.mock('./deliveryClient', () => ({ ...jest.requireActual<typeof import('./deliveryClient')>('./deliveryClient'), readReviewedBook: jest.fn() }))
jest.mock('@/lib/offline/bookEdits', () => ({ readBookEdit: jest.fn() }))
const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333'
const listed = { id, user_id: actor, project_id: project, type: 'leveling' as const, name: 'Listed run', data: { bs: '1.5000' }, _origin: 'server' as const }
beforeEach(() => { jest.resetAllMocks() })
test('a reviewed revision is paired with its fetched data, never the stale listing payload', async () => {
  jest.mocked(readReviewedBook).mockResolvedValue({ ...listed, name: 'New server edit', data: { bs: '2.0000' }, status: 'active', revision: '12', created_at: null, updated_at: null })
  expect(await prepareWorkingBook(actor, project, listed, true)).toMatchObject({ book: { data: { bs: '2.0000' } }, origin: { kind: 'revision', revision: '12' } })
})
test('an unapplied schema still permits viewing retained content with an unknown baseline', async () => {
  jest.mocked(readReviewedBook).mockRejectedValue(new BookDeliveryError('Schema not ready', 503, 'FIELDBOOK_DELIVERY_SCHEMA'))
  const result = await prepareWorkingBook(actor, project, listed, true)
  expect(result).toMatchObject({ book: { data: listed.data }, origin: { kind: 'unknown' } })
  expect(typeof result.warning).toBe('string')
})
test('a permission refusal cannot be converted into a reviewed baseline or silent fallback', async () => {
  jest.mocked(readReviewedBook).mockRejectedValue(new BookDeliveryError('Access revoked', 403))
  await expect(prepareWorkingBook(actor, project, listed, true)).rejects.toThrow('Access revoked')
})
test('an offline retained operation opens its immutable content with its own ancestry', async () => {
  const requestId = '44444444-4444-4444-8444-444444444444'
  jest.mocked(readBookEdit).mockResolvedValue({ requestId, projectId: project, bookId: id, type: 'leveling', name: 'Local snapshot', data: { bs: '1.7500' }, basis: { kind: 'new' } })
  expect(await prepareWorkingBook(actor, project, { ...listed, localEditId: requestId }, false)).toMatchObject({ book: { data: { bs: '1.7500' } }, origin: { kind: 'operation', requestId } })
})
test('a retained operation cannot be reassigned through a cached book id', async () => {
  jest.mocked(readBookEdit).mockResolvedValue({ requestId: id, bookId: project, projectId: project, type: 'leveling', name: 'Other book', data: {}, basis: { kind: 'new' } })
  await expect(prepareWorkingBook(actor, project, { ...listed, localEditId: id }, false)).rejects.toThrow()
})
