/** @jest-environment node */
import { db } from '@/lib/db'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { readFieldbookRevision, saveFieldbookRevision } from './deliveryServer'
import type { FieldbookSaveRequest } from './delivery'
jest.mock('@/lib/db', () => ({ db: { transaction: jest.fn() } }))
jest.mock('@/lib/enterprise/auditTrail', () => ({ logAuditEvent: jest.fn() }))

const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', bookId = '33333333-3333-4333-8333-333333333333'
const request: FieldbookSaveRequest = { protocol: 'fieldbook-save-v1', requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId, baseRevision: null,
  type: 'leveling', name: 'Original run', data: { rows: [{ station: 'BM', bs: '1.5000', fs: '', is: '' }], openingRL: '', reference: null } }
let book: Record<string, unknown> | null, receipt: Record<string, unknown> | null, allowed: boolean, skipBook: boolean, skipReceipt: boolean
let nextRevision = BigInt(1)
let alteredReceipt = false
let missingSchema = false
let receipts = new Map<string, Record<string, unknown>>()
const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.includes('lock_project_for_read')) return { rows: [{ user_id: actor }] }
  if (sql.includes('field_observation_project_access')) return { rows: [{ allowed }] }
  if (sql.includes('SELECT') && sql.includes('FROM public.fieldbook_save_receipts')) {
    const saved = receipts.get(`${String(params[0])}:${String(params[1])}`)
    return { rows: saved ? [saved] : [] }
  }
  if (sql.includes('SELECT') && sql.includes('FROM public.fieldbooks')) {
    if (missingSchema) throw Object.assign(new Error('Revision column unavailable'), { code: '42703' })
    return { rows: book ? [book] : [] }
  }
  if (sql.startsWith('INSERT INTO public.fieldbooks')) {
    if (skipBook) return { rows: [] }
    book = { id: params[0], project_id: params[1], user_id: params[2], type: params[3], name: params[4], data: JSON.parse(String(params[5])) as unknown,
      status: 'active', revision: (nextRevision++).toString(), created_at: '2026-10-21T08:00:00.000Z', updated_at: '2026-10-21T08:00:00.000Z' }
    return { rows: [book] }
  }
  if (sql.startsWith('UPDATE public.fieldbooks')) {
    if (skipBook || !book || book.revision !== params[6]) return { rows: [] }
    book = { ...book, name: params[3], type: params[4], data: JSON.parse(String(params[5])) as unknown, revision: (nextRevision++).toString() }
    return { rows: [book] }
  }
  if (sql.startsWith('INSERT INTO public.fieldbook_save_receipts')) {
    if (skipReceipt) return { rows: [] }
    receipt = { protocol: 'fieldbook-save-v1', field_verified: false, actor_id: params[0], request_id: params[1], project_id: params[2], book_id: params[3], input_hash: params[4], base_revision: params[5], saved_revision: params[6], payload_hash: params[7], book_snapshot: JSON.parse(String(params[8])) as unknown,
      base_snapshot: params[9] === null ? null : JSON.parse(String(params[9])) as unknown }
    receipts.set(`${String(params[0])}:${String(params[1])}`, receipt)
    return { rows: [alteredReceipt ? { ...receipt, request_id: '88888888-8888-4888-8888-888888888888' } : receipt] }
  }
  return { rows: [] }
})
beforeEach(() => {
  book = null; receipt = null; allowed = true; skipBook = false; skipReceipt = false; alteredReceipt = false; nextRevision = BigInt(1); jest.clearAllMocks()
  missingSchema = false
  receipts = new Map()
  jest.mocked(logAuditEvent).mockResolvedValue('audit')
  jest.mocked(db.transaction).mockImplementation(async work => {
    const before = structuredClone({ book, receipt, receipts })
    try { return await work({ query } as never) }
    catch (error) { book = before.book; receipt = before.receipt; receipts = before.receipts; throw error }
  })
})

test('commits the exact raw payload, server revision, receipt and audit together', async () => {
  const saved = await saveFieldbookRevision(actor, request)
  expect(saved).toMatchObject({ book: { id: bookId, user_id: actor, project_id: project, data: request.data, revision: '1' }, receipt: { requestId: request.requestId, baseRevision: null, savedRevision: '1', fieldVerified: false }, replayed: false })
  expect(receipt?.book_snapshot).toEqual(saved.book)
  expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ resourceId: bookId, resourceType: 'fieldbooks', userId: actor }), expect.anything())
})
test('an old acknowledged request replays its own receipt without replacing a later edited book', async () => {
  const first = await saveFieldbookRevision(actor, request)
  await saveFieldbookRevision(actor, { ...request, requestId: '55555555-5555-4555-8555-555555555555', baseRevision: '1', name: 'Later edit' })
  query.mockClear()
  expect(await saveFieldbookRevision(actor, request)).toMatchObject({ book: first.book, currentRevision: '2', replayed: true })
  expect(book?.name).toBe('Later edit')
  expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false)
})
test('a request ID cannot be rebound to different raw strings', async () => {
  await saveFieldbookRevision(actor, request)
  await expect(saveFieldbookRevision(actor, { ...request, data: { rows: [] } })).rejects.toMatchObject({ statusCode: 409 })
  expect(book?.data).toEqual(request.data)
})
test('only the reviewed current revision can replace a book; device timestamps confer no authority', async () => {
  await saveFieldbookRevision(actor, request)
  const edit = { ...request, requestId: '55555555-5555-4555-8555-555555555555', baseRevision: '1', name: 'Reviewed edit' }
  expect(await saveFieldbookRevision(actor, edit)).toMatchObject({ book: { name: 'Reviewed edit', revision: '2' } })
  await expect(saveFieldbookRevision(actor, { ...edit, requestId: '66666666-6666-4666-8666-666666666666', name: 'Stale overwrite' })).rejects.toMatchObject({ statusCode: 409 })
  expect(book?.name).toBe('Reviewed edit')
})

test('an accepted edit retains the complete prior book snapshot as well as the new revision', async () => {
  const first = await saveFieldbookRevision(actor, request)
  await saveFieldbookRevision(actor, { ...request, requestId: '55555555-5555-4555-8555-555555555555', baseRevision: '1', name: 'Reviewed edit' })
  expect(receipt?.base_snapshot).toEqual(first.book)
})
test('lost book/receipt acknowledgements and audit failures roll back both book and receipt', async () => {
  skipBook = true
  await expect(saveFieldbookRevision(actor, request)).rejects.toThrow()
  expect(book).toBeNull(); expect(receipt).toBeNull()
  skipBook = false; skipReceipt = true
  await expect(saveFieldbookRevision(actor, request)).rejects.toThrow()
  expect(book).toBeNull(); expect(receipt).toBeNull()
  skipReceipt = false; jest.mocked(logAuditEvent).mockRejectedValueOnce(new Error('Audit unavailable'))
  await expect(saveFieldbookRevision(actor, request)).rejects.toThrow('Audit unavailable')
  expect(book).toBeNull(); expect(receipt).toBeNull()
})
test('revoked recording access and another author cannot use a saved receipt as write authority', async () => {
  await saveFieldbookRevision(actor, request)
  allowed = false
  await expect(saveFieldbookRevision(actor, request)).rejects.toMatchObject({ statusCode: 403 })
  allowed = true
  await expect(saveFieldbookRevision('77777777-7777-4777-8777-777777777777', request)).rejects.toMatchObject({ statusCode: 403 })
})

test('an acknowledgement rebound to a different request cannot commit a book', async () => {
  alteredReceipt = true
  await expect(saveFieldbookRevision(actor, request)).rejects.toMatchObject({ statusCode: 500 })
  expect(book).toBeNull(); expect(receipt).toBeNull()
})

test('a save cannot drop or replace a retained original source snapshot, including opaque legacy metadata', async () => {
  const original = { legacySource: 'retained verbatim', rawReading: '1.5000' }
  book = { id: bookId, project_id: project, user_id: actor, type: 'leveling', name: request.name, status: 'active', revision: '0',
    created_at: '2026-10-21T08:00:00.000Z', updated_at: '2026-10-21T08:00:00.000Z', data: { ...request.data, sourceImport: original } }
  await expect(saveFieldbookRevision(actor, { ...request, baseRevision: '0' })).rejects.toMatchObject({ statusCode: 409 })
  expect(book?.data).toMatchObject({ sourceImport: original })
  const saved = await saveFieldbookRevision(actor, { ...request, baseRevision: '0', data: { ...request.data, sourceImport: original } })
  expect(saved.book.data.sourceImport).toEqual(original)
})

test('archived work remains readable and old delivery can be acknowledged without reactivating it', async () => {
  await saveFieldbookRevision(actor, request)
  book = { ...book, status: 'archived', revision: '2' }
  expect(await readFieldbookRevision(actor, project, bookId)).toMatchObject({ status: 'archived', revision: '2' })
  expect(await saveFieldbookRevision(actor, request)).toMatchObject({ replayed: true, currentRevision: '2' })
  await expect(saveFieldbookRevision(actor, { ...request, requestId: '55555555-5555-4555-8555-555555555555', baseRevision: '2' })).rejects.toMatchObject({ statusCode: 409 })
  expect(book?.status).toBe('archived')
})

test('an unapplied revision schema reports unready and never acknowledges or changes work', async () => {
  missingSchema = true
  await expect(saveFieldbookRevision(actor, request)).rejects.toMatchObject({ statusCode: 503, code: 'FIELDBOOK_DELIVERY_SCHEMA' })
  expect(book).toBeNull(); expect(receipt).toBeNull()
})
