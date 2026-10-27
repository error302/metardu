/** @jest-environment node */
import { Client, type PoolClient } from 'pg'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import {
  createRoadWorkbenchDraft,
  evaluateRoadWorkbenchDraft,
} from '../roadWorkbenchDraft'
import {
  executeRoadWorkbenchCommand,
  loadRoadWorkbenchSource,
} from '../roadWorkbenchRecoveryServer'
import type { RoadWorkbenchCommand } from '../roadWorkbenchRecoveryContract'
import { QueryBuilder } from '@/lib/db/queryBuilder'
import { verifyAlignmentMirrorSnapshot, syncAlignmentProjectInputs } from '../alignmentProjectSync'
import { hashDesignPayload } from '../designRevisions'
import type { OwnedAlignment } from '../alignmentAccess'
jest.mock('@/lib/db', () => ({ db: {} }))
const native = process.env.METARDU_ROAD_NATIVE_SQL === '1' ? it : it.skip
native(
  'uses the actual restricted SQL role, preserves JSON and rolls back an injected archive failure in the exact synthetic database',
  async () => {
    const connection =
      process.env.TEST_ADMIN_DATABASE_URL ??
      'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
    const target = new URL(connection)
    expect([target.hostname, target.port, target.pathname]).toEqual([
      '127.0.0.1',
      '55433',
      '/metardu_runtime_verify',
    ])
    const client = new Client({
      connectionString: connection,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    })
    const scope = client as unknown as PoolClient,
      actor = randomUUID(),
      project = randomUUID(),
      checks: string[] = []
    const paths = [
      'src/lib/engineering/roadWorkbenchRecoveryServer.ts',
      'src/lib/engineering/roadWorkbenchRecoveryContract.ts',
      'src/lib/engineering/roadDesignSchema.ts',
      'src/lib/engineering/roadWorkbenchDraft.ts',
      'src/lib/engineering/designRevisions.ts',
      'src/lib/validation/engineeringPayload.ts',
      'src/lib/engineering/__tests__/roadWorkbenchRecoveryNative.test.ts',
      'src/lib/db/queryBuilder.ts',
      'src/app/api/db/route.ts',
      'src/lib/engineering/alignmentProjectSync.ts',
      'src/app/api/engineering/ips/route.ts',
    ]
    const hashes = async () =>
        Object.fromEntries(
          await Promise.all(
            paths.map(
              async (p) =>
                [
                  p,
                  createHash('sha256')
                    .update(await readFile(p))
                    .digest('hex'),
                ] as const,
            ),
          ),
        ),
      sourceHashes = await hashes()
    const check = (name: string, ok: boolean) => {
      expect(ok).toBe(true)
      checks.push(name)
    }
    const example = roadWorkbenchExample(),
      engineering = {
        mode: 'road',
        standard: 'KRDM2017',
        road: example.road,
        pipeNetwork: { retain: 'unrelated design' },
      }
    let begun = false
    await client.connect()
    try {
      const marker = (
        await client.query<{ marker: string }>(
          "SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0].marker
      expect(marker).toBe(
        'METARDU synthetic beacon verification only 2026-10-08',
      )
      const migrations = (
        await client.query<{ version: string; checksum: string }>(
          'SELECT version,checksum FROM schema_migrations ORDER BY version',
        )
      ).rows
      await client.query('BEGIN')
      begun = true
      await client.query(
        "INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,'SYNTHETIC-NOT-A-LOGIN-HASH','SYNTHETIC transactional road proof','user',true)",
        [actor, `${actor}@example.invalid`],
      )
      await client.query(
        "INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",
        [actor],
      )
      await client.query(
        "INSERT INTO projects(id,user_id,name,survey_type,engineering_data) VALUES($1,$2,'SYNTHETIC rollback-only road proof','engineering',$3::jsonb)",
        [project, actor, JSON.stringify(engineering)],
      )
      await client.query(
        "INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,$2,'Synthetic WGS84 UTM 37S','WGS84','metres',37,'S','Synthetic BM','local','grid',3,$3)",
        [project, example.reference.code, actor],
      )
      await client.query('SET LOCAL ROLE release_app')
      await client.query(
        "SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true),set_config('request.organization_id','',true),set_config('request.access_role','',true)",
        [actor],
      )
      const role = (
        await client.query<{
          role: string
          rolsuper: boolean
          rolbypassrls: boolean
        }>(
          'SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
        )
      ).rows[0]
      check(
        'actual command client uses non-superuser/non-bypass release_app',
        role.role === 'release_app' && !role.rolsuper && !role.rolbypassrls,
      )
      await client.query('SAVEPOINT conditional_engineering')
      const newer={...engineering,reviewed:'synthetic conditional update'}
      const accepted=await new QueryBuilder(scope,'projects').update({engineering_data:newer}).eq('id',project).eq('user_id',actor).eq('engineering_data',engineering)
      expect(accepted.error).toBeNull()
      expect(accepted.data).toHaveLength(1)
      const stale=await new QueryBuilder(scope,'projects').update({engineering_data:engineering}).eq('id',project).eq('user_id',actor).eq('engineering_data',engineering)
      expect(stale.error).toBeNull()
      expect(stale.data).toEqual([])
      check('actual conditional UPDATE refuses an older snapshot after a newer write',true)
      const alignment={project_id:project} as OwnedAlignment
      await expect(verifyAlignmentMirrorSnapshot(scope,alignment)).rejects.toMatchObject({statusCode:409,code:'ENGINEERING_SNAPSHOT_REQUIRED'})
      await expect(syncAlignmentProjectInputs(scope,alignment,'ips',[])).rejects.toMatchObject({statusCode:409,code:'ENGINEERING_SNAPSHOT_REQUIRED'})
      check('actual saved engineering project refuses blind legacy edits and obsolete sync-back',true)
      await expect(verifyAlignmentMirrorSnapshot(scope,alignment,hashDesignPayload({engineering}))).rejects.toThrow(/changed/i)
      expect(await verifyAlignmentMirrorSnapshot(scope,alignment,hashDesignPayload({engineering:newer}))).toBe(true)
      check('actual mirror precondition refuses a delayed copy and accepts the exact saved snapshot',true)
      await client.query('UPDATE projects SET engineering_data=NULL WHERE id=$1',[project])
      expect(await verifyAlignmentMirrorSnapshot(scope,alignment)).toBe(false)
      await syncAlignmentProjectInputs(scope,alignment,'ips',[])
      expect((await client.query<{engineering_data:unknown}>('SELECT engineering_data FROM projects WHERE id=$1',[project])).rows[0].engineering_data).toBeNull()
      check('standalone alignment editing admits SQL-null drafts without creating project JSON',true)
      const initialized=await new QueryBuilder(scope,'projects').update({engineering_data:engineering}).eq('id',project).eq('user_id',actor).is('engineering_data',null)
      expect(initialized.error).toBeNull()
      expect(initialized.data).toHaveLength(1)
      const repeated=await new QueryBuilder(scope,'projects').update({engineering_data:newer}).eq('id',project).eq('user_id',actor).is('engineering_data',null)
      expect(repeated.error).toBeNull()
      expect(repeated.data).toEqual([])
      check('actual null-snapshot initialization cannot replace an already initialized project',true)
      expect((await client.query<{engineering_data:unknown}>('SELECT engineering_data FROM projects WHERE id=$1',[project])).rows[0].engineering_data).toEqual(engineering)
      check('conditional refusals preserve the exact saved engineering JSON',true)
      await client.query('ROLLBACK TO SAVEPOINT conditional_engineering')
      await client.query(
        "UPDATE projects SET engineering_data=jsonb_set(engineering_data,'{precision_fixture}','0.333333333333333333333333333333'::jsonb,true) WHERE id=$1",
        [project],
      )
      await expect(
        loadRoadWorkbenchSource(scope, actor, project),
      ).rejects.toThrow(/precision|represent/i)
      check(
        'high precision JSON is retained instead of rounded into another snapshot',
        (
          await client.query<{ same: boolean }>(
            "SELECT engineering_data->'precision_fixture'='0.333333333333333333333333333333'::jsonb AS same FROM projects WHERE id=$1",
            [project],
          )
        ).rows[0].same,
      )
      await client.query(
        "UPDATE projects SET engineering_data=engineering_data-'precision_fixture' WHERE id=$1",
        [project],
      )
      await client.query(
        "UPDATE projects SET engineering_data=jsonb_set(engineering_data,'{nonfinite_fixture}','1e400'::jsonb,true) WHERE id=$1",
        [project],
      )
      await expect(
        loadRoadWorkbenchSource(scope, actor, project),
      ).rejects.toThrow(/finite|unsupported/i)
      check(
        'non-finite JavaScript decode is refused before JSON coercion',
        (
          await client.query<{ same: boolean }>(
            "SELECT engineering_data->'nonfinite_fixture'='1e400'::jsonb AS same FROM projects WHERE id=$1",
            [project],
          )
        ).rows[0].same,
      )
      await client.query(
        "UPDATE projects SET engineering_data=engineering_data-'nonfinite_fixture' WHERE id=$1",
        [project],
      )
      const make = async (level: string): Promise<RoadWorkbenchCommand> => {
        const source = await loadRoadWorkbenchSource(scope, actor, project),
          draft = createRoadWorkbenchDraft(source.road)
        draft.vips[0].reducedLevel = level
        const road = evaluateRoadWorkbenchDraft(
          source.road,
          draft,
          source.reference,
        ).road
        if (!road) throw Error('Synthetic road fixture could not be evaluated')
        return JSON.parse(
          JSON.stringify({
            version: 1,
            actorId: actor,
            projectId: project,
            requestId: randomUUID(),
            expectedEngineeringHash: source.engineeringHash,
            expectedReferenceHash: source.referenceHash,
            road,
          }),
        ) as RoadWorkbenchCommand
      }
      const command = await make('99'),
        saved = await executeRoadWorkbenchCommand(
          scope,
          actor,
          command,
          'commit',
        )
      check(
        'actual guarded road update and immutable archive succeed',
        saved.state === 'committed',
      )
      const row = (
        await client.query<{ engineering_data: typeof engineering }>(
          'SELECT engineering_data FROM projects WHERE id=$1',
          [project],
        )
      ).rows[0]
      expect(row.engineering_data.pipeNetwork).toEqual(engineering.pipeNetwork)
      expect(row.engineering_data.road).toEqual(command.road)
      check(
        'road-only JSON update preserves unrelated engineering values',
        true,
      )
      const cancelled = await make('98'),
        cancel = await executeRoadWorkbenchCommand(
          scope,
          actor,
          cancelled,
          'cancel',
        )
      expect(
        await executeRoadWorkbenchCommand(scope, actor, cancelled, 'commit'),
      ).toEqual(cancel)
      check(
        'actual immutable cancellation prevents late command application',
        cancel.state === 'cancelled',
      )
      const failed = await make('97'),
        before = (
          await client.query<{ engineering_data: unknown }>(
            'SELECT engineering_data FROM projects WHERE id=$1',
            [project],
          )
        ).rows[0].engineering_data
      await client.query('SAVEPOINT archive_failure')
      const fault = {
        query: async (sql: string, values?: unknown[]) => {
          if (/INSERT INTO design_revisions/.test(sql))
            throw Error('Synthetic archive append failure')
          return client.query<Record<string, unknown>>(sql, values)
        },
      } as unknown as PoolClient
      await expect(
        executeRoadWorkbenchCommand(fault, actor, failed, 'commit'),
      ).rejects.toThrow('Synthetic archive append failure')
      await client.query('ROLLBACK TO SAVEPOINT archive_failure')
      expect(
        (
          await client.query<{ engineering_data: unknown }>(
            'SELECT engineering_data FROM projects WHERE id=$1',
            [project],
          )
        ).rows[0].engineering_data,
      ).toEqual(before)
      expect(
        (
          await client.query(
            'SELECT id FROM design_revisions WHERE project_id=$1 AND entity_id=$2',
            [project, failed.requestId],
          )
        ).rows,
      ).toHaveLength(0)
      check(
        'storage failure rollback restores the project and leaves no outcome',
        true,
      )
      await client.query('ROLLBACK')
      begun = false
      expect(
        (await client.query('SELECT id FROM users WHERE id=$1', [actor])).rows,
      ).toHaveLength(0)
      expect(
        (await client.query('SELECT id FROM projects WHERE id=$1', [project]))
          .rows,
      ).toHaveLength(0)
      expect(
        (
          await client.query(
            'SELECT id FROM design_revisions WHERE project_id=$1',
            [project],
          )
        ).rows,
      ).toHaveLength(0)
      check('all native fixture identities and outcomes are rolled back', true)
      expect(
        (
          await client.query<{ version: string; checksum: string }>(
            'SELECT version,checksum FROM schema_migrations ORDER BY version',
          )
        ).rows,
      ).toEqual(migrations)
      check('applied migration hashes are unchanged', true)
      expect(await hashes()).toEqual(sourceHashes)
      await mkdir('.cache/engineering-writer-boundary', { recursive: true })
      await writeFile(
        '.cache/engineering-writer-boundary/native-sql.json',
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            database: 'metardu_runtime_verify',
            checks,
            sourceHashes,
            allFixturesRolledBack: true,
            productionMutated: false,
          },
          null,
          2,
        ) + '\n',
      )
    } finally {
      if (begun) await client.query('ROLLBACK')
      await client.end()
    }
  },
  120000,
)
