import test from 'node:test'
import assert from 'node:assert/strict'
import { getAppliedMigrations } from '../scripts/migrate-unified.mjs'

test('migration history lookup fails closed when the database is unreachable', async () => {
  const failure = Object.assign(new Error('unavailable'), { code: 'ENOTFOUND' })
  const pool = { query: async () => { throw failure } }
  await assert.rejects(getAppliedMigrations(pool), error => error === failure)
})

test('an accessible database without a migration table has empty history', async () => {
  const pool = { query: async () => ({ rows: [] }) }
  assert.equal((await getAppliedMigrations(pool)).size, 0)
})

test('legacy filename-based migration history is read without modifying it', async () => {
  const calls = []
  const pool = {
    query: async sql => {
      calls.push(sql)
      if (calls.length === 1) return { rows: [{ column_name: 'filename' }, { column_name: 'applied_at' }] }
      return { rows: [{ version: '077_chatgpt_oauth.sql', checksum: null, applied_at: null }] }
    },
  }
  const applied = await getAppliedMigrations(pool)
  assert.equal(applied.get('077_chatgpt_oauth').checksum, null)
  assert.match(calls[1], /SELECT filename AS version, NULL AS checksum, applied_at/)
  assert.equal(calls.some(sql => /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(sql)), false)
})
