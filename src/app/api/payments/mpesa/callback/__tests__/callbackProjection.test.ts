/**
 * The M-Pesa callback must never select a column that the selected table does
 * not have. `payment_intents` has no `transaction_id`; the column exists only
 * on `payment_history`. Selecting it from the legacy table raises 42703 and
 * aborts the callback before the authoritative payment_history fallback runs,
 * so a real, paid checkout can never complete.
 */
import fs from 'node:fs'
import path from 'node:path'

const routePath = path.join(__dirname, '..', 'route.ts')
const source = fs.readFileSync(routePath, 'utf8')

function projectionsFor(table: string): string[] {
  const matches = source.matchAll(
    new RegExp(`SELECT\\s+([\\s\\S]*?)\\s+FROM\\s+${table}\\b`, 'gi'),
  )
  return [...matches].map(match => match[1].replace(/\s+/g, ' ').trim())
}

describe('M-Pesa callback SQL projections', () => {
  it('never selects transaction_id from payment_intents', () => {
    const projections = projectionsFor('payment_intents')
    expect(projections.length).toBeGreaterThan(0)
    for (const projection of projections) {
      expect(projection).not.toMatch(/\btransaction_id\b/)
    }
  })

  it('keeps transaction_id on the authoritative payment_history projections', () => {
    const projections = projectionsFor('payment_history')
    expect(projections.length).toBeGreaterThan(0)
    expect(projections.some(projection => /\btransaction_id\b/.test(projection))).toBe(true)
  })
})
