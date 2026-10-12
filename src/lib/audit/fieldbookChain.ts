export interface FieldbookChainEvent {
  id: string
  action: string
  prev_hash: string | null
  hash: string
}

/** Check predecessor links, without trusting timestamp order or claiming signatures. */
export function verifyFieldbookChain(events: FieldbookChainEvent[]) {
  const base = { events: events.length, scope: 'predecessor-links-only' as const }
  const invalid = (reason: string, event?: FieldbookChainEvent) => ({
    ...base, valid: false, reason, broken_at: event?.id,
  })
  if (events.length === 0) return invalid('No accessible audit history to verify')
  const hashes = new Set<string>()
  const successors = new Map<string, FieldbookChainEvent>()
  for (const event of events) {
    if (!event.hash || event.prev_hash === null) return invalid('Missing hash evidence', event)
    if (hashes.has(event.hash)) return invalid('Repeated hash makes the chain ambiguous', event)
    if (successors.has(event.prev_hash)) return invalid('Multiple events share a predecessor', event)
    hashes.add(event.hash)
    successors.set(event.prev_hash, event)
  }
  const visited = new Set<string>()
  let last: FieldbookChainEvent | undefined
  let next = successors.get('')
  while (next) {
    if (visited.has(next.hash)) return invalid('Cyclic audit history', next)
    visited.add(next.hash)
    last = next
    next = successors.get(next.hash)
  }
  if (visited.size !== events.length || !last) return invalid('Missing predecessor or disconnected history')
  return { ...base, valid: true, last_hash: last.hash, last_action: last.action }
}
