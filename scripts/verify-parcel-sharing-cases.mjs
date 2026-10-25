import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
export const EXPECTED_CASES = 27
export async function verifyParcelSharing(c) {
  const {
    check,
    pool,
    actor,
    other,
    project,
    secondProject,
    schema,
    require,
    fresh,
    post,
    full,
    randomUUID,
    setFault,
  } = c
  const { NextRequest } = require('next/server')
  const {
    GET,
    POST,
  } = require('../src/app/api/project/[id]/scheme/shares/route.ts')
  const {
    GET: publicGet,
  } = require('../src/app/api/public/parcel/[id]/route.ts')
  const key = () => randomBytes(32).toString('base64url')
  const digest = (text) => createHash('sha256').update(text).digest('hex')
  const read = (query = '', user = actor, id = project) =>
    GET(
      new NextRequest(
        `http://127.0.0.1:3021/api/project/${id}/scheme/shares${query}`,
      ),
      user,
      id,
    )
  const write = (body, user = actor, id = project, action = '') =>
    POST(
      new NextRequest(
        `http://127.0.0.1:3021/api/project/${id}/scheme/shares${action}`,
        {
          method: 'POST',
          body: typeof body === 'string' ? body : JSON.stringify(body),
        },
      ),
      user,
      id,
    )
  const publicRead = (body, changes = {}) =>
    publicGet(
      new NextRequest(
        `http://127.0.0.1:3021/api/public/parcel/${body.requestId}${changes.query ?? ''}`,
        {
          headers: changes.omit
            ? {}
            : { authorization: `Bearer ${changes.key ?? body.key}` },
        },
      ),
      { params: Promise.resolve({ id: changes.id ?? body.requestId }) },
    )
  const unwrap = async (response) => {
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json()).data
  }
  let draft
  const prepare = async () => {
    const exported = await fresh()
    await full(await post(exported))
    draft = exported
    const preview = await unwrap(
      await read(`?mode=preview&export_request_id=${exported.requestId}`),
    )
    return {
      projectId: project,
      expectedUserId: actor,
      requestId: randomUUID(),
      exportRequestId: exported.requestId,
      snapshotHash: preview.snapshotHash,
      durationDays: 7,
      authorityToShare: true,
      key: key(),
    }
  }
  const count = async () =>
    (await pool.query('SELECT COUNT(*)::int n FROM parcel_draft_shares'))
      .rows[0].n
  let ddl = readFileSync(
    'src/lib/db/migrations/121_parcel_draft_sharing.sql',
    'utf8',
  ).split('-- DOWN:')[0]
  for (const name of [
    'parcel_draft_shares',
    'projects',
    'users',
    'deliverable_revisions',
    'deliverables',
    'surveyor_profiles',
    'guard_parcel_draft_share_update',
    'read_parcel_draft_share',
  ])
    ddl = ddl.replaceAll(`public.${name}`, `${schema}.${name}`)
  await pool.query(
    'CREATE TABLE surveyor_profiles(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,is_suspended boolean DEFAULT false)',
  )
  await pool.query(ddl)
  await pool.query(`CREATE FUNCTION fixture_share_fault() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE f text:=current_setting('metardu_fixture.boundary_fault',true);BEGIN
   IF f='share_suppress' THEN RETURN NULL;END IF;
   IF f='share_key' THEN NEW.token_hash=repeat('0',64);END IF;
   IF f='share_intent' THEN NEW.command_hash=repeat('0',64);END IF;
   IF f='share_revision' THEN NEW.export_request_id=gen_random_uuid();END IF;
   IF f='share_snapshot' THEN NEW.snapshot=replace(NEW.snapshot,'SYN-A','SYN-B');NEW.snapshot_hash=encode(public.digest(NEW.snapshot,'sha256'),'hex');END IF;
   RETURN NEW;END $$;
   CREATE TRIGGER share_fault BEFORE INSERT ON parcel_draft_shares FOR EACH ROW EXECUTE FUNCTION fixture_share_fault();`)
  await check(
    'a legacy private project ID or missing capability reveals no project or coordinates',
    async () => {
      const body = await prepare()
      for (const change of [
        { omit: true },
        { id: project },
        { key: key() },
        { query: '?key=secret' },
      ]) {
        const response = await publicRead(body, change)
        assert.equal(response.status, 404)
        assert.doesNotMatch(
          await response.text(),
          /SYN-A|500000|client|surveyor_name|Arc 1960/,
        )
      }
    },
  )
  await check(
    'share preview is exact retained geometry with a public field allowlist',
    async () => {
      const body = await prepare(),
        data = await unwrap(
          await read(`?mode=preview&export_request_id=${body.exportRequestId}`),
        )
      assert.equal(
        data.snapshotHash,
        digest(
          require('../src/lib/audit/auditHash.ts').canonicalJSON(data.snapshot),
        ),
      )
      assert.equal(data.snapshot.parcels.length, 1)
      assert.equal(data.snapshot.parcels[0].gridAreaSqM, 200)
      assert.deepEqual(Object.keys(data.snapshot.parcels[0]).sort(), [
        'coordinates',
        'gridAreaSqM',
        'label',
      ])
      assert.equal(data.snapshot.sourceCrs, 'EPSG:32737')
      assert.equal(data.snapshot.fieldVerified, false)
      assert.doesNotMatch(
        JSON.stringify(data.snapshot),
        /clientName|phone|monument|station|blockId|parcelId/,
      )
    },
  )
  await check(
    'preview and sharing history are account and project bound',
    async () => {
      const body = await prepare()
      assert.equal(
        (
          await read(
            `?mode=preview&export_request_id=${body.exportRequestId}`,
            other,
          )
        ).status,
        404,
      )
      assert.equal(
        (
          await read(
            `?mode=preview&export_request_id=${body.exportRequestId}`,
            actor,
            secondProject,
          )
        ).status,
        404,
      )
      assert.equal((await read('', other)).status, 404)
      assert.equal((await read('', '')).status, 401)
    },
  )
  await check(
    'explicit grant stores only key hash and bounded immutable snapshot',
    async () => {
      const body = await prepare(),
        receipt = await unwrap(await write(body)),
        row = (
          await pool.query('SELECT * FROM parcel_draft_shares WHERE id=$1', [
            body.requestId,
          ])
        ).rows[0]
      assert.equal(receipt.id, body.requestId)
      assert.equal(receipt.snapshotHash, body.snapshotHash)
      assert.equal(row.token_hash, digest(body.key))
      assert.equal(row.snapshot_hash, digest(row.snapshot))
      assert.equal(
        Date.parse(receipt.expiresAt) - Date.parse(receipt.createdAt),
        7 * 86400000,
      )
      assert.equal(JSON.stringify(row).includes(body.key), false)
      const publicData = await unwrap(await publicRead(body))
      assert.equal(publicData.id, receipt.id)
      assert.deepEqual(Object.keys(publicData).sort(), [
        'createdAt',
        'expiresAt',
        'id',
        'snapshot',
        'snapshotHash',
      ])
      assert.equal(
        publicData.snapshot.artifactHash,
        row.snapshot ? JSON.parse(row.snapshot).artifactHash : '',
      )
    },
  )
  await check(
    'same sharing intent recovers exact receipt after a lost response',
    async () => {
      const body = await prepare(),
        first = await unwrap(await write(body)),
        again = await unwrap(await write(body))
      assert.deepEqual(again, first)
      assert.equal(await count(), 1)
    },
  )
  await check(
    'changing a recovered sharing intent is refused without a second grant',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      for (const change of [
        { durationDays: 1 },
        { key: key() },
        { exportRequestId: randomUUID() },
        { snapshotHash: 'b'.repeat(64) },
      ])
        assert.equal((await write({ ...body, ...change })).status, 409)
      assert.equal(await count(), 1)
    },
  )
  await check(
    'concurrent identical grants serialize to one retained receipt',
    async () => {
      const body = await prepare(),
        replies = await Promise.all([write(body), write(body)])
      const values = await Promise.all(replies.map(unwrap))
      assert.deepEqual(values[0], values[1])
      assert.equal(await count(), 1)
    },
  )
  await check(
    'changed preview and unreviewed or overlong grants fail before writes',
    async () => {
      const body = await prepare()
      for (const change of [
        { snapshotHash: 'b'.repeat(64) },
        { authorityToShare: false },
        { durationDays: 365 },
        { key: 'short' },
        { expectedUserId: other },
        { projectId: secondProject },
      ])
        assert.ok(
          [400, 403, 409].includes(
            (await write({ ...body, ...change })).status,
          ),
        )
      assert.equal((await write('invalid JSON')).status, 400)
      assert.equal((await write({ padding: 'x'.repeat(9000) })).status, 413)
      assert.equal(await count(), 0)
    },
  )
  for (const fault of [
    'share_suppress',
    'share_key',
    'share_intent',
    'share_revision',
    'share_snapshot',
  ])
    await check(
      `sharing exact acknowledgement rolls back ${fault}`,
      async () => {
        const body = await prepare()
        setFault(fault)
        try {
          assert.equal((await write(body)).status, 409)
        } finally {
          setFault('')
        }
        assert.equal(await count(), 0)
      },
    )
  await check(
    'lost COMMIT acknowledgement recovers the original capability without renewal',
    async () => {
      const body = await prepare()
      setFault('lost_commit_ack')
      assert.equal((await write(body)).status, 500)
      setFault('')
      const row = (
        await pool.query(
          'SELECT expires_at FROM parcel_draft_shares WHERE id=$1',
          [body.requestId],
        )
      ).rows[0]
      const receipt = await unwrap(await write(body))
      assert.equal(Date.parse(receipt.expiresAt), row.expires_at.getTime())
      assert.equal(await count(), 1)
    },
  )
  await check(
    'revocation is exact and idempotent and immediately closes subsequent reads',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      assert.equal((await publicRead(body)).status, 200)
      const revoked = await unwrap(
        await write(
          { shareId: body.requestId },
          actor,
          project,
          '?action=revoke',
        ),
      )
      assert.ok(revoked.revokedAt)
      assert.deepEqual(
        await unwrap(
          await write(
            { shareId: body.requestId },
            actor,
            project,
            '?action=revoke',
          ),
        ),
        revoked,
      )
      assert.equal((await publicRead(body)).status, 404)
      assert.deepEqual(await unwrap(await write(body)), revoked)
    },
  )
  await check(
    'foreign revocation and history cannot disclose or alter grants',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      assert.equal(
        (
          await write(
            { shareId: body.requestId },
            other,
            project,
            '?action=revoke',
          )
        ).status,
        404,
      )
      assert.equal(
        (
          await write(
            { shareId: body.requestId },
            actor,
            secondProject,
            '?action=revoke',
          )
        ).status,
        404,
      )
      assert.equal(
        (
          await write(
            { shareId: randomUUID() },
            actor,
            project,
            '?action=revoke',
          )
        ).status,
        404,
      )
      assert.equal((await publicRead(body)).status, 200)
    },
  )
  await check(
    'ownership transfer closes capabilities and isolates former actor history',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
        other,
        project,
      ])
      assert.equal((await publicRead(body)).status, 404)
      assert.equal((await read()).status, 404)
      assert.equal((await unwrap(await read('', other))).total, 0)
    },
  )
  await check('expired grants do not disclose the retained draft', async () => {
    const body = await prepare()
    await unwrap(await write(body))
    const expiredId = randomUUID()
    await pool.query(
      `INSERT INTO parcel_draft_shares SELECT $1,project_id,actor_id,export_request_id,revision_id,token_hash,command_hash,snapshot_hash,snapshot,duration_days,created_at-INTERVAL '31 days',expires_at-INTERVAL '31 days',NULL FROM parcel_draft_shares WHERE id=$2`,
      [expiredId, body.requestId],
    )
    assert.equal(
      (await publicRead({ ...body, requestId: expiredId })).status,
      404,
    )
  })
  await check(
    'a suspended issuer cannot continue exposing a previously shared draft',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      await pool.query('INSERT INTO surveyor_profiles VALUES($1,true)', [actor])
      assert.equal((await publicRead(body)).status, 404)
    },
  )
  await check(
    'current geometry changes never replace a previously shared snapshot',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      const before = await unwrap(await publicRead(body))
      await pool.query(
        "UPDATE parcels SET status='approved',revision_number=revision_number+1,updated_at=now() WHERE project_id=$1",
        [project],
      )
      assert.deepEqual(await unwrap(await publicRead(body)), before)
    },
  )
  await check(
    'sharing history is metadata only with bounded 24-row pagination',
    async () => {
      const body = await prepare()
      for (let i = 0; i < 26; i++)
        await unwrap(
          await write({ ...body, requestId: randomUUID(), key: key() }),
        )
      const first = await unwrap(await read('?page=1')),
        second = await unwrap(await read('?page=2'))
      assert.equal(first.total, 26)
      assert.equal(first.rows.length, 24)
      assert.equal(second.rows.length, 2)
      assert.equal(
        new Set([...first.rows, ...second.rows].map((row) => row.id)).size,
        26,
      )
      assert.doesNotMatch(
        JSON.stringify(first),
        /token_hash|command_hash|coordinates|snapshot\":|key\":/,
      )
    },
  )
  await check(
    'history and preview reject parameter substitutions instead of silently changing scope',
    async () => {
      await prepare()
      for (const query of [
        '?page=0',
        '?page=1&page=2',
        '?mode=preview',
        '?page=1&project_id=foreign',
        '?mode=preview&export_request_id=bad',
      ])
        assert.equal((await read(query)).status, 400)
    },
  )
  await check(
    'unavailable sharing storage is an error rather than an empty history',
    async () => {
      await prepare()
      await pool.query(
        'ALTER TABLE parcel_draft_shares RENAME TO fixture_unavailable_shares',
      )
      try {
        assert.equal((await read()).status, 409)
      } finally {
        await pool.query(
          'ALTER TABLE fixture_unavailable_shares RENAME TO parcel_draft_shares',
        )
      }
    },
  )
  await check(
    'immutable sharing records refuse key replacement, renewal and deletion privileges',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      await assert.rejects(
        pool.query('UPDATE parcel_draft_shares SET token_hash=$1 WHERE id=$2', [
          'b'.repeat(64),
          body.requestId,
        ]),
        /Only first revocation/,
      )
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SET LOCAL ROLE authenticated')
        for (const sql of [
          'DELETE FROM parcel_draft_shares',
          'TRUNCATE parcel_draft_shares',
        ]) {
          await client.query('SAVEPOINT permission_probe')
          await assert.rejects(client.query(sql), /permission denied/)
          await client.query('ROLLBACK TO SAVEPOINT permission_probe')
        }
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    },
  )
  await check(
    'ordinary role may read only its owned grants but capability lookup needs no account',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      const client = await pool.connect()
      await pool.query(
        `GRANT USAGE ON SCHEMA ${schema} TO authenticated;GRANT SELECT ON projects,deliverables,deliverable_revisions TO authenticated`,
      )
      try {
        await client.query('BEGIN')
        await client.query('SET LOCAL ROLE authenticated')
        await client.query("SELECT set_config('request.user_id',$1,true)", [
          other,
        ])
        assert.equal(
          (await client.query('SELECT id FROM parcel_draft_shares')).rows
            .length,
          0,
        )
        const capability = await client.query(
          `SELECT ${schema}.read_parcel_draft_share($1,$2) value`,
          [body.requestId, digest(body.key)],
        )
        assert.equal(capability.rows[0].value.id, body.requestId)
        await client.query("SELECT set_config('request.user_id',$1,true)", [
          actor,
        ])
        assert.equal(
          (await client.query('SELECT id FROM parcel_draft_shares')).rows
            .length,
          1,
        )
        const inserted = await client.query(
          `INSERT INTO parcel_draft_shares(id,project_id,actor_id,export_request_id,revision_id,token_hash,command_hash,snapshot_hash,snapshot,duration_days,expires_at) SELECT $1,project_id,actor_id,export_request_id,revision_id,token_hash,command_hash,snapshot_hash,snapshot,1,transaction_timestamp()+INTERVAL '24 hours' FROM parcel_draft_shares WHERE id=$2 RETURNING id`,
          [randomUUID(), body.requestId],
        )
        assert.equal(inserted.rowCount, 1)
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    },
  )
  await check(
    'ordinary role cannot append a grant with a foreign or unrelated retained revision',
    async () => {
      const body = await prepare()
      await unwrap(await write(body))
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SET LOCAL ROLE authenticated')
        await client.query("SELECT set_config('request.user_id',$1,true)", [
          actor,
        ])
        await assert.rejects(
          client.query(
            `INSERT INTO parcel_draft_shares(id,project_id,actor_id,export_request_id,revision_id,token_hash,command_hash,snapshot_hash,snapshot,duration_days,expires_at) SELECT $1,$2,actor_id,export_request_id,revision_id,token_hash,command_hash,snapshot_hash,snapshot,1,transaction_timestamp()+INTERVAL '24 hours' FROM parcel_draft_shares WHERE id=$3`,
            [randomUUID(), secondProject, body.requestId],
          ),
          /row-level security/,
        )
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    },
  )
  await check(
    'a corrupt retained artifact is refused rather than reconstructed for sharing',
    async () => {
      const body = await prepare(),
        path = (
          await pool.query(
            "SELECT storage_path FROM deliverable_revisions WHERE manifest#>>'{request,id}'=$1",
            [draft.requestId],
          )
        ).rows[0].storage_path
      const { writeFileSync } = await import('node:fs')
      const nodePath = await import('node:path')
      writeFileSync(nodePath.join(process.env.STORAGE_ROOT, path), 'CORRUPT')
      assert.equal((await write(body)).status, 409)
      assert.equal(await count(), 0)
    },
  )
}
