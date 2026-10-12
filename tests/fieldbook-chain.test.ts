import { verifyFieldbookChain } from '@/lib/audit/fieldbookChain'

const chain = [
  { id: 'first', action: 'INSERT', prev_hash: '', hash: 'a' },
  { id: 'second', action: 'UPDATE', prev_hash: 'a', hash: 'b' },
  { id: 'third', action: 'DELETE', prev_hash: 'b', hash: 'c' },
]

test('follows links when multiple writes share a timestamp and SQL returns them unordered', () => {
  expect(verifyFieldbookChain([chain[2], chain[0], chain[1]])).toEqual({
    valid: true, events: 3, scope: 'predecessor-links-only', last_hash: 'c', last_action: 'DELETE',
  })
})
test('does not claim verification when no accessible history exists', () => {
  expect(verifyFieldbookChain([])).toMatchObject({ valid: false, events: 0 })
})
test.each([
  ['missing predecessor', [chain[0], chain[2]]],
  ['missing root', [chain[1], chain[2]]],
  ['branch', [chain[0], chain[1], { ...chain[2], prev_hash: 'a' }]],
  ['duplicate hash', [chain[0], { ...chain[1], hash: 'a' }]],
  ['missing evidence', [{ ...chain[0], prev_hash: null }]],
  ['disconnected cycle', [chain[0], { ...chain[1], prev_hash: 'c' }, chain[2]]],
])('rejects %s', (_reason, events) => {
  expect(verifyFieldbookChain(events as typeof chain)).toMatchObject({ valid: false })
})
