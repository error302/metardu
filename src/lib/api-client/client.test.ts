import { createClient } from './client'

describe('browser query mutation chaining', () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'book' }], error: null }) } as Response)
    global.fetch = fetchMock
  })
  afterAll(() => { global.fetch = originalFetch })

  it.each(['insert', 'update', 'upsert', 'delete'] as const)('preserves %s when selecting return columns', async (operation) => {
    const builder = createClient().from('fieldbooks')
    const payload = { id: 'book', name: 'Site observations' }
    const mutation = operation === 'delete' ? builder.delete()
      : operation === 'upsert' ? builder.upsert(payload, { onConflict: 'id' })
      : builder[operation](payload)
    const result = await mutation.eq('id', 'book').select('id').single()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ operation, table: 'fieldbooks', columns: 'id', single: true, filters: [{ column: 'id', op: 'eq', value: 'book' }] })
    expect(body.payload).toEqual(operation === 'delete' ? null : payload)
    if (operation === 'upsert') expect(body.onConflict).toBe('id')
    expect(result.error).toBeNull()
  })

  it('keeps ordinary select requests as reads', async () => {
    await createClient().from('projects').select('id', { count: 'exact', head: true })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as unknown).toMatchObject({ operation: 'select', payload: null, count: true, head: true })
  })

  it('reports a rejected write instead of success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Access denied' }) } as Response)
    const result = await createClient().from('fieldbooks').upsert({ id: 'book' }).select('id')
    expect(result).toMatchObject({ data: null, error: { code: '403', message: 'Access denied' } })
  })
})
