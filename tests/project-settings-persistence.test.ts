/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { PATCH } from '@/app/api/project/[id]/route'
import { projectSettingsPatchSchema, changedProjectSettings, type ProjectSettingsDraft } from '@/lib/validation/projectSettings'
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn() } }))
jest.mock('@/lib/cache/memory-cache', () => ({ CacheKeys: { project: (id: string) => id }, projectCache: { invalidate: jest.fn() } }))
import { projectCache } from '@/lib/cache/memory-cache'
const ctx = { userId: 'owner', params: { id: 'synthetic-project' }, body: {}, session: null }
const invoke = (body: unknown) => PATCH(new NextRequest('http://127.0.0.1/api/project/synthetic-project', { method: 'PATCH' }), { ...ctx, body } as never)
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(db.query).mockResolvedValue({ rows: [{ id: ctx.params.id }], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] })
})

test('name-only save uses an atomic owner predicate without touching reference or traverse columns', async () => {
  expect((await invoke({ name: 'Synthetic renamed' })).status).toBe(200)
  const [sql, values] = jest.mocked(db.query).mock.calls[0]
  expect(sql).toContain('WHERE id = $2 AND user_id = $3')
  expect(sql).not.toMatch(/traverse|utm_zone|hemisphere|datum/)
  expect(values).toEqual(['Synthetic renamed', 'synthetic-project', 'owner'])
  expect(projectCache.invalidate).toHaveBeenCalledTimes(1)
})

test.each([0, null, 0.002])('closure %s updates only its JSON key and retains unrelated evidence in the database', async value => {
  const response = await invoke({ linear_error_m: value })
  expect(response.status).toBe(200)
  const [sql, values] = jest.mocked(db.query).mock.calls[0]
  expect(sql).toContain("jsonb_set(COALESCE(traverse, '{}'::jsonb), '{linearError}', $1::jsonb, true)")
  expect(sql).toContain("jsonb_typeof(traverse) = 'object'")
  expect(values).toEqual([JSON.stringify(value), 'synthetic-project', 'owner'])
})

test.each([{}, { datum: 'ARC1960' }, { utm_zone: 37 }, { hemisphere: 'S' }, { traverse: { source: 'forged' } }, { user_id: 'another-owner' }, { name: ' ' }, { linear_error_m: -1 }, { linear_error_m: true }, { linear_error_m: '0' }, { start_chainage: [] }, { start_chainage: Infinity }])('rejects invalid or protected metadata %p before database access', async body => {
  expect((await invoke(body)).status).toBe(400)
  expect(db.query).not.toHaveBeenCalled()
})

test.each([{ rows: [], rowCount: 0 }, { rows: [], rowCount: 1 }, { rows: [{ id: 'other' }], rowCount: 1 }])('does not claim a save when the database result is unconfirmed', async result => {
  jest.mocked(db.query).mockResolvedValueOnce(result as never)
  expect((await invoke({ name: 'Changed' })).status).toBe(409)
  expect(projectCache.invalidate).not.toHaveBeenCalled()
})

test('draft comparison preserves untouched legacy invalid measurements and validates changed ones', () => {
  const baseline = { name: 'Old', linear_error_m: 'legacy unknown', start_chainage: '' } as ProjectSettingsDraft
  expect(changedProjectSettings({ ...baseline, name: 'New' }, baseline)).toEqual({ name: 'New' })
  expect(changedProjectSettings(baseline, baseline)).toBeNull()
  expect(() => changedProjectSettings({ ...baseline, linear_error_m: '0x10' }, baseline)).toThrow()
  expect(() => changedProjectSettings({ ...baseline, linear_error_m: '-1' }, baseline)).toThrow()
  expect(changedProjectSettings({ ...baseline, linear_error_m: '0', start_chainage: '0' }, baseline)).toEqual({ linear_error_m: 0, start_chainage: 0 })
  expect(projectSettingsPatchSchema.safeParse({ name: 'New', engineering_data: {} }).success).toBe(false)
})
