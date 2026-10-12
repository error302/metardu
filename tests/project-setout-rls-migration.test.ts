import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(process.cwd(), 'src/lib/db/migrations/089_setout_project_rls.sql'),
  'utf8',
)

describe('project set-out RLS migration contract', () => {
  test.each([
    'setout_definitions',
    'setout_points',
    'setout_observations',
    'verticality_readings',
    'project_tolerance_profiles',
    'tolerance_profiles',
  ])('forces row security on %s', (table) => {
    expect(migration).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    expect(migration).toMatch(new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, 'i'))
  })

  test('restricts child records through the owning project and active organization context', () => {
    expect(migration).toContain('metardu_rls_can_access_project')
    expect(migration).toContain('current_setting(\'request.user_id\', true)')
    expect(migration).toContain('public.current_org_id()')
    expect(migration).toContain('om.is_active = TRUE')
    expect(migration).toContain('d.project_id = setout_observations.project_id')
  })

  test('keeps global defaults readable and project criteria immutable after creation', () => {
    expect(migration).toContain('is_default IS TRUE')
    expect(migration).toContain('create_own_tolerance_profiles')
    expect(migration).not.toMatch(/CREATE POLICY\s+\w+\s+ON\s+tolerance_profiles\s+FOR\s+(UPDATE|DELETE)/i)
  })
})
