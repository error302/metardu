import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(process.cwd(), 'src/lib/db/migrations/094_organization_project_role_revocation.sql'),
  'utf8',
)

function policy(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = migration.match(new RegExp(`CREATE POLICY "${escaped}"[\\s\\S]*?;`, 'i'))
  if (!match) throw new Error(`Missing policy ${name} in organization RLS migration.`)
  return match[0]
}

describe('organization project role-revocation migration contract', () => {
  test('the legacy owner policy remains restricted to personal projects', () => {
    const ownerPolicy = policy('owner_all_projects')
    expect(ownerPolicy.match(/organization_id IS NULL/gi)).toHaveLength(2)
    expect(ownerPolicy.match(/user_id::text = NULLIF\(current_setting\('request\.user_id', true\), ''\)/gi)).toHaveLength(2)
  })

  test('project creators do not bypass active organization membership on project data', () => {
    const readFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.can_read_project_data[\s\S]*?\$\$;/i)?.[0]
    const writeFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.can_write_project_data[\s\S]*?\$\$;/i)?.[0]
    expect(readFunction).toBeDefined()
    expect(writeFunction).toBeDefined()
    expect(readFunction).toContain('public.has_active_organization_role(project.organization_id)')
    expect(writeFunction).toContain("ARRAY['org_admin', 'project_manager', 'surveyor']")
    expect(readFunction).not.toMatch(/project\.user_id/i)
    expect(writeFunction).not.toMatch(/project\.user_id/i)
  })

  test('firm project read, update, and delete policies require the selected organization role', () => {
    expect(policy('org_member_read_projects')).toContain('public.current_org_id()')
    expect(policy('org_member_read_projects')).toContain('public.has_active_organization_role(organization_id)')
    expect(policy('org_member_update_projects')).toContain('public.can_manage_organization_projects(organization_id)')
    expect(policy('org_member_delete_projects')).toContain('public.can_manage_organization_projects(organization_id)')
    for (const name of ['org_member_read_projects', 'org_member_update_projects', 'org_member_delete_projects']) {
      expect(policy(name)).not.toMatch(/user_id\s*::\s*text/i)
    }
  })

  test('project organization scope cannot be changed to escape firm RLS', () => {
    expect(migration).toContain('NEW.organization_id IS DISTINCT FROM OLD.organization_id')
    expect(migration).toContain('CREATE TRIGGER protect_project_organization_scope')
    expect(migration).toContain('BEFORE UPDATE OF organization_id ON public.projects')
    expect(migration).toContain("USING ERRCODE = '42501'")
  })

  test('automated rollback cannot restore the insecure creator bypass', () => {
    const rollback = migration.match(/-- DOWN\b[\s\S]*$/i)?.[0]
    expect(rollback).toContain('RAISE EXCEPTION')
    expect(rollback).toContain('security-forward-only')
    expect(rollback).toContain('forward security migration')
  })
})
