import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

export async function snapshotCollaborationRows(client) {
  const rows = []
  for (const table of ['project_members', 'project_fieldbook_entries', 'surfaces', 'surface_revisions']) {
    const { rows: [fingerprint] } = await client.query(
      "SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS hash FROM public." + table + ' t')
    rows.push([table, fingerprint])
  }
  return rows
}

export async function collaborationPolicies(client) {
  return (await client.query("SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('survey_points','project_fieldbook_entries') ORDER BY tablename,policyname")).rows
}

export async function seedCollaborationUpgrade(client) {
  const ids = Object.fromEntries(['owner','crew','viewer','unrelated','unknown','project','foreign','point','entry','surface','revision','foreignSurface','foreignRevision'].map(name => [name, randomUUID()]))
  const inputHash = 'a'.repeat(64)
  const referenceHash = 'b'.repeat(64)
  const evidence = JSON.stringify({ algorithm: 'sha256-canonical-json-v1', contoursHash: 'c'.repeat(64), meshHash: 'd'.repeat(64) })
  for (const actor of [ids.owner, ids.crew, ids.viewer, ids.unrelated, ids.unknown]) {
    await client.query("INSERT INTO public.users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic','SYNTHETIC collaboration upgrade')", [actor, actor + '@example.invalid'])
    await client.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)", [actor])
  }
  for (const [project, actor, surface, revision] of [[ids.project,ids.owner,ids.surface,ids.revision],[ids.foreign,ids.unrelated,ids.foreignSurface,ids.foreignRevision]]) {
    await client.query("INSERT INTO public.projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC retained project')", [project, actor])
    await client.query("INSERT INTO public.surfaces(id,project_id,name) VALUES($1,$2,'SYNTHETIC surface')", [surface, project])
    await client.query("INSERT INTO public.surface_revisions(id,surface_id,revision,algorithm,input_hash,result) VALUES($1,$2,1,'synthetic-upgrade',$3,$4)",
      [revision, surface, inputHash, JSON.stringify({ snapshot: { referenceHash }, outputIntegrity: JSON.parse(evidence) })])
    await client.query('UPDATE public.surfaces SET current_revision_id=$1 WHERE id=$2', [revision, surface])
  }
  await client.query("INSERT INTO public.project_members(project_id,user_id,role) VALUES($1,$2,'surveyor'),($1,$3,'viewer'),($1,$4,'unexpected_role')", [ids.project,ids.crew,ids.viewer,ids.unknown])
  await client.query("INSERT INTO public.survey_points(id,project_id,point_name,easting,northing,elevation) VALUES($1,$2,'SYNTHETIC zero elevation',500000,9900000,0)", [ids.point,ids.project])
  await client.query("INSERT INTO public.project_fieldbook_entries(id,project_id,row_index,station,raw_data) VALUES($1,$2,0,'SYNTHETIC retained record',$3)", [ids.entry,ids.project,JSON.stringify({ distance: 0, unknown: null })])
  return { ids, inputHash, referenceHash, evidence }
}

export async function checkCollaborationRuntime(runtimeUrl, fixture, check) {
  const { ids, inputHash, referenceHash, evidence } = fixture
  const runtime = new pg.Client({ connectionString: runtimeUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
  await runtime.connect()
  try {
    assert.equal(runtimeDatabaseRoleFailure((await runtime.query(RUNTIME_ROLE_QUERY)).rows[0]), null)
    const { rows: [rights] } = await runtime.query("SELECT has_table_privilege('public.surface_source_reviews','SELECT') AS read, has_table_privilege('public.surface_source_reviews','INSERT') AS insert, has_table_privilege('public.surface_source_reviews','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS mutation")
    assert.deepEqual(rights, { read: true, insert: true, mutation: false })
    check('runtime-role')
    await runtime.query('BEGIN')
    const actor = id => runtime.query("SELECT set_config('request.user_id',$1,true),set_config('request.org_id','',true),set_config('request.access_role','',true)", [id])
    const denied = async (run, code = '42501') => {
      await runtime.query('SAVEPOINT denied_collaboration')
      try { await assert.rejects(run, { code }) }
      finally {
        await runtime.query('ROLLBACK TO SAVEPOINT denied_collaboration')
        await runtime.query('RELEASE SAVEPOINT denied_collaboration')
      }
    }
    for (const [user, expected] of [[ids.crew,1],[ids.viewer,1],[ids.unrelated,0],[ids.unknown,0]]) {
      await actor(user)
      for (const [table, row, field] of [['survey_points',ids.point,'description'],['project_fieldbook_entries',ids.entry,'station']]) {
        assert.equal((await runtime.query('SELECT id FROM public.'+table+' WHERE id=$1', [row])).rowCount, expected)
        assert.equal((await runtime.query('UPDATE public.'+table+' SET '+field+"='forbidden' WHERE id=$1", [row])).rowCount, 0)
        assert.equal((await runtime.query('DELETE FROM public.'+table+' WHERE id=$1', [row])).rowCount, 0)
      }
      await denied(() => runtime.query("INSERT INTO public.survey_points(project_id,point_name) VALUES($1,'forbidden')", [ids.project]))
      await denied(() => runtime.query("INSERT INTO public.project_fieldbook_entries(project_id,row_index,station) VALUES($1,1,'forbidden')", [ids.project]))
    }
    await actor(ids.owner)
    assert.equal((await runtime.query("UPDATE public.project_fieldbook_entries SET station='SYNTHETIC owner edit' WHERE id=$1", [ids.entry])).rowCount, 1)
    check('shared-read-boundaries')
    const insert = (overrides = {}) => {
      const row = { actor: ids.crew, revision: ids.revision, input: inputHash, reference: referenceHash, output: evidence, ...overrides }
      const digest = row.digest ?? createHash('sha256').update(row.output).digest('hex')
      return runtime.query("INSERT INTO public.surface_source_reviews(id,project_id,source_revision_id,source_hash,source_reference_hash,source_output_hash,source_output_evidence,actor_id,request_id,command_hash,outcome,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reviewed_for_draft','SYNTHETIC review') RETURNING id",
        [randomUUID(),ids.project,row.revision,row.input,row.reference,digest,row.output,row.actor,randomUUID(),'e'.repeat(64)])
    }
    await actor(ids.crew)
    const { rows: [{ id: saved }] } = await insert()
    for (const wrong of [{actor:ids.owner},{revision:ids.foreignRevision},{input:'f'.repeat(64)},{reference:'f'.repeat(64)},{output:'{"wrong":true}'}]) await denied(() => insert(wrong))
    await denied(() => insert({digest:'f'.repeat(64)}), '23514')
    await denied(() => runtime.query("UPDATE public.surface_source_reviews SET note='forbidden' WHERE id=$1", [saved]))
    await denied(() => runtime.query('DELETE FROM public.surface_source_reviews WHERE id=$1', [saved]))
    await actor(ids.viewer)
    assert.equal((await runtime.query('SELECT id FROM public.surface_source_reviews WHERE id=$1', [saved])).rowCount, 1)
    await denied(() => insert({actor:ids.viewer}))
    await actor(ids.unrelated)
    assert.equal((await runtime.query('SELECT id FROM public.surface_source_reviews WHERE id=$1', [saved])).rowCount, 0)
    await denied(() => insert({actor:ids.unrelated}))
    check('append-only-review-boundaries')
  } finally {
    try { await runtime.query('ROLLBACK') } finally { await runtime.end() }
  }
}
