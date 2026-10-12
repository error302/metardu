import assert from 'node:assert/strict'
import test from 'node:test'
import { postgresConnectionString, quoteIdentifier } from './provision-runtime-db-role.mjs'

test('PostgreSQL connection strings preserve reserved characters in credentials', () => {
  const connectionString = postgresConnectionString({
    host: 'db.internal',
    port: 5432,
    database: 'metardu_test',
    user: 'app@runtime',
    password: 'p/a:ss@word#%+?=',
  })
  const parsed = new URL(connectionString)

  assert.equal(parsed.hostname, 'db.internal')
  assert.equal(parsed.port, '5432')
  assert.equal(parsed.pathname, '/metardu_test')
  assert.equal(decodeURIComponent(parsed.username), 'app@runtime')
  assert.equal(decodeURIComponent(parsed.password), 'p/a:ss@word#%+?=')
})

test('SQL identifier quoting doubles embedded quote characters', () => {
  assert.equal(quoteIdentifier('metardu_app'), '"metardu_app"')
  assert.equal(quoteIdentifier('bad"role'), '"bad""role"')
})
