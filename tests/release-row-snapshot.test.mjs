import test from 'node:test'
import assert from 'node:assert/strict'
import { RELEASE_PRESERVED_TABLES, snapshotExistingRows } from '../scripts/release-row-snapshot.mjs'

test('a partial, duplicated or foreign catalog cannot certify original-data preservation', async () => {
  const complete = RELEASE_PRESERVED_TABLES.map(name => ({ name, columns: ['id'] }))
  for (const catalog of [[], complete.slice(1), complete.concat(complete[0]), complete.map((row, i) => i ? row : { ...row, name: 'unrelated' }), complete.map((row, i) => i ? row : { ...row, columns: [] })]) {
    const calls = []
    const client = { query: async sql => { calls.push(sql); return { rows: [] } } }
    await assert.rejects(snapshotExistingRows(client, catalog))
    assert.equal(calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    assert.equal(calls.at(-1), 'ROLLBACK')
  }
})

test('a failed original-data query rolls back and cannot return a partial snapshot', async () => {
  const fault = new Error('synthetic read failure')
  const calls = []
  const client = { query: async sql => {
    calls.push(sql)
    if (sql.includes('AS fingerprint')) throw fault
    return { rows: [] }
  } }
  await assert.rejects(snapshotExistingRows(client, RELEASE_PRESERVED_TABLES.map(name => ({ name, columns: ['id'] }))), fault)
  assert.equal(calls.at(-1), 'ROLLBACK')
  assert.ok(!calls.includes('COMMIT'))
})
