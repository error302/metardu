import { SaveEngineeringDataSchema } from './apiSchemas'

const input = (data: Record<string, unknown>) => ({ projectId: 'AA11BB22-CC33-4DD4-8EE5-FF6677889900', subtype: ' road ', data })

test('preserves zero null negative coordinates arrays and source labels', () => {
  const data = { zero: 0, unknown: null, coordinates: [-1, 0, 9850000], source: { name: 'Original observation', accepted: false } }
  expect(SaveEngineeringDataSchema.parse(input(data))).toEqual({ projectId: 'aa11bb22-cc33-4dd4-8ee5-ff6677889900', subtype: 'road', data })
})

test.each([Infinity, -Infinity, NaN])('refuses nested nonfinite number %s before JSON encoding can change it', value => {
  expect(SaveEngineeringDataSchema.safeParse(input({ observations: [{ height: value }] })).success).toBe(false)
})

test('refuses an actual overflow literal decoded by JSON.parse', () => {
  const data = JSON.parse('{"height":1e400}') as Record<string, unknown>
  expect(SaveEngineeringDataSchema.safeParse(input(data)).success).toBe(false)
})

test('nested data stays JSON rather than silently dropping undefined fields or non-JSON objects', () => {
  for (const value of [undefined, () => 1, BigInt(1), new Date(), new Map()]) {
    expect(SaveEngineeringDataSchema.safeParse(input({ record: value })).success).toBe(false)
  }
})

test('cyclic payloads fail without recursive stack overflow', () => {
  const data: Record<string, unknown> = {}; data.self = data
  expect(SaveEngineeringDataSchema.safeParse(input(data)).success).toBe(false)
})

test('deep and oversized JSON trees are bounded before persistence', () => {
  let deep: Record<string, unknown> = { value: 0 }
  for (let i = 0; i < 70; i++) deep = { next: deep }
  expect(SaveEngineeringDataSchema.safeParse(input(deep)).success).toBe(false)
  expect(SaveEngineeringDataSchema.safeParse(input({ values: Array.from({ length: 200001 }, () => 0) })).success).toBe(false)
})

test('unsupported outer fields and blank subtypes are refused', () => {
  expect(SaveEngineeringDataSchema.safeParse({ ...input({}), userId: 'someone-else' }).success).toBe(false)
  expect(SaveEngineeringDataSchema.safeParse({ ...input({}), subtype: ' ' }).success).toBe(false)
})
