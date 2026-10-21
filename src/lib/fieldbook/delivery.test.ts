import { canonicalDeliveryJson, fieldbookSaveRequestSchema } from './delivery'

const input = { requestId: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222', bookId: '33333333-3333-4333-8333-333333333333',
  protocol: 'fieldbook-save-v1', baseRevision: null, type: 'leveling', name: 'Retained run', data: { bs: '0.0000', height: null } }
test('retains original values and special own raw keys without a prototype/hash collision', () => {
  const raw: unknown = JSON.parse('{"__proto__":{"original":"retained"},"bs":"0.0000","height":null}')
  const parsed = fieldbookSaveRequestSchema.parse({ ...input, data: raw })
  expect(canonicalDeliveryJson(parsed.data)).toBe('{"__proto__":{"original":"retained"},"bs":"0.0000","height":null}')
})
test.each(['-1', '01', '1.5', '9223372036854775808'])('refuses an invalid revision %s without guessing a baseline', baseRevision => {
  expect(fieldbookSaveRequestSchema.safeParse({ ...input, baseRevision }).success).toBe(false)
})
test('refuses non-JSON values and client-supplied owner fields', () => {
  expect(fieldbookSaveRequestSchema.safeParse({ ...input, data: { height: NaN } }).success).toBe(false)
  expect(fieldbookSaveRequestSchema.safeParse({ ...input, data: { observedAt: new Date('2026-10-21T08:00:00Z') } }).success).toBe(false)
  expect(fieldbookSaveRequestSchema.safeParse({ ...input, user_id: input.requestId }).success).toBe(false)
})
