/** @jest-environment node */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// These historical artifacts were recovered and matched to the production
// ledger. SQL semantics alone are insufficient: mixed line endings are hashed.
it.each([
  ['052_schema_drift_reconciliation.sql', '1b7bcc2e314ee10efa4bdf324738c49b7c05311932e86ed9a566167e1a5756fc'],
  ['064_project_settings_fields.sql', '152e67e043cfad39c2267c7a695933559d5e3ac26089eb0498a084b3723892e7'],
])('preserves the recovered applied bytes of %s', (filename, checksum) => {
  const file = readFileSync(resolve('src/lib/db/migrations', filename))
  expect(createHash('sha256').update(file).digest('hex')).toBe(checksum)
})
