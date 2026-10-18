/** @jest-environment node */
// Preliminary real SQL/RLS/service proof inside one rolled-back transaction.
// A pinned normal migration/HTTP rehearsal is still required before release.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { Client,type PoolClient } from 'pg'
import { db } from '@/lib/db'
import { recordOfflineObservation } from '@/lib/field/observationCaptureServer'

const run=process.env.METARDU_FIELD_SYNC_ROLLBACK==='synthetic-only'?test:test.skip
run('native raw capture, role enforcement and rollback preserve existing field evidence',async()=>{
  const address=new URL(process.env.TEST_ADMIN_DATABASE_URL??'')
  assert.equal(address.hostname,'127.0.0.1');assert.equal(address.port,'55433');assert.equal(address.pathname,'/metardu_runtime_verify')
  const runtime='release_beacon_app',client=new Client({connectionString:address.toString(),connectionTimeoutMillis:5000})
  const query=(sql:string,values?:unknown[])=>client.query<Record<string,unknown>>(sql,values)
  const owner=randomUUID(),crew=randomUUID(),viewer=randomUUID(),stranger=randomUUID(),project=randomUUID(),firm=randomUUID(),firmProject=randomUUID()
  const report:{status:string;checks:string[];cleanup?:boolean;failure?:string}={status:'checking',checks:[]}
  const save=()=>writeFileSync('.cache/field-sync/rollback-native.json',JSON.stringify(report,null,2)+'\n')
  const check=(name:string)=>{report.checks.push(name);save()}
  let before:unknown,countsBefore:unknown
  await client.connect()
  const fingerprint=async()=>{
    const rows=[]
    for(const table of ['survey_observations','field_photos'])rows.push((await query(`SELECT '${table}' name,count(*)::int n,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) hash FROM ${table} t`)).rows[0])
    return rows
  }
  const admin=()=>query('RESET ROLE')
  const actor=async(id:string,org='')=>{
    await query(`SET LOCAL ROLE "${runtime}"`)
    await query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true),set_config('request.organization_id',$2,true)",[id,org])
  }
  const transaction=jest.spyOn(db,'transaction').mockImplementation(async work=>{
    await query('SAVEPOINT native_delivery')
    try {const result=await work(client as unknown as PoolClient);await query('RELEASE SAVEPOINT native_delivery');return result}
    catch(error){await query('ROLLBACK TO SAVEPOINT native_delivery');await query('RELEASE SAVEPOINT native_delivery');throw error}
  })
  const input=(id:string,projectId=project)=>({id,projectId,surveyType:'traverse',station:'STN-1',pointId:'RD1',easting:0,northing:10,elevation:0,horizontalDistance:0,bearingDeg:0,bearingMin:0,bearingSec:0,notes:'SYNTHETIC raw capture',createdAt:'2026-10-18T08:00:00.000Z',syncedAt:null})
  const deliver=async(id:string,value:unknown,org='')=>{await actor(id,org);return recordOfflineObservation(id,value)}
  try{
    assert.equal((await query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
    before=(await query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
    assert.equal((before as unknown[]).length,118)
    const role=(await query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[runtime])).rows[0]
    assert.ok(role&&!role.rolsuper&&!role.rolbypassrls)
    countsBefore=await fingerprint();await query('BEGIN');save()
    for(const id of [owner,crew,viewer,stranger])await query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic-hash','SYNTHETIC rollback field-sync test')",[id,`${id}@example.invalid`])
    await query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC raw field regression','engineering')",[project,owner])
    await query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'surveyor'),($1,$3,'viewer')",[project,crew,viewer])
    await query("INSERT INTO organizations(id,name,slug,owner_id,plan) VALUES($1,'SYNTHETIC field firm',$2,$3,'team')",[firm,`synthetic-${firm}`,owner])
    await query("INSERT INTO organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'org_admin',true),($1,$3,'surveyor',true),($1,$4,'viewer',true)",[firm,owner,crew,viewer])
    await query("INSERT INTO projects(id,user_id,organization_id,name,survey_type) VALUES($1,$2,$3,'SYNTHETIC firm field regression','engineering')",[firmProject,owner,firm])
    const legacy=randomUUID()
    await query("INSERT INTO survey_observations(id,project_id,client_id,point_name,observation_type,easting,northing,elevation) VALUES($1,$2,'legacy-unreceipted','SYNTHETIC legacy','manual',0,0,NULL)",[legacy,project])
    const original=(await query('SELECT to_jsonb(t) value FROM survey_observations t WHERE id=$1',[legacy])).rows[0].value
    const up=readFileSync('src/lib/db/migrations/114_field_observation_roles.sql','utf8').split(/^\s*--\s*DOWN\b/m)[0]
    await query(up)
    expect((await query('SELECT to_jsonb(t) value FROM survey_observations t WHERE id=$1',[legacy])).rows[0].value).toEqual(original)
    check('pending authorization SQL preserves legacy NULL/zero observations without altering the 118-entry ledger')

    const first=await deliver(owner,input('first'))
    expect(first).toMatchObject({ok:true,id:'first',replayed:false,fieldVerified:false})
    const batch=(await query('SELECT quality_metadata,point_count,observation_count FROM observation_batches WHERE id=$1',[first.batchId])).rows[0]
    expect(batch).toMatchObject({point_count:0,observation_count:1,quality_metadata:{capturedBy:null,uploadedBy:owner,fieldVerified:false,raw:{easting:0,elevation:0,horizontalDistance:0,bearingDeg:0}}})
    check('restricted-role real INSERTs archive complete raw readings without inventing a reviewed point or capturer')
    expect(await deliver(owner,{...input('first'),syncError:'old connection failure'})).toMatchObject({observationId:first.observationId,batchId:first.batchId,replayed:true})
    await expect(deliver(owner,{...input('first'),elevation:undefined})).rejects.toMatchObject({statusCode:409})
    await expect(deliver(crew,input('first'))).rejects.toMatchObject({statusCode:409})
    check('identical delivery replays exact IDs; changed content and another uploader cannot overwrite the receipt')
    await expect(deliver(owner,input('legacy-unreceipted'))).rejects.toMatchObject({statusCode:409})
    check('existing unreceipted observations are retained for review rather than adopted or overwritten')
    expect((await query('SELECT count(*)::int n FROM survey_points WHERE project_id=$1',[project])).rows[0].n).toBe(0)
    check('raw synchronization does not create authoritative survey points')
    await expect(deliver(viewer,input('viewer'))).rejects.toMatchObject({statusCode:403})
    await expect(deliver(stranger,input('stranger'))).rejects.toMatchObject({statusCode:404})
    expect(await deliver(crew,input('personal-crew'))).toMatchObject({replayed:false})
    check('personal project surveyors may record while viewers and strangers cannot')

    expect(await deliver(crew,input('firm-crew',firmProject),firm)).toMatchObject({replayed:false})
    await expect(deliver(viewer,input('firm-viewer',firmProject),firm)).rejects.toMatchObject({statusCode:403})
    await expect(deliver(crew,input('wrong-firm-context',firmProject))).rejects.toMatchObject({statusCode:404})
    await admin();await query("UPDATE organization_members SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[firm,owner])
    await expect(deliver(owner,input('demoted-creator',firmProject),firm)).rejects.toMatchObject({statusCode:403})
    await admin();await query('UPDATE organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2',[firm,owner])
    await expect(deliver(owner,input('removed-creator',firmProject),firm)).rejects.toMatchObject({statusCode:404})
    check('firm-only surveyors work; firm viewers, wrong context and demoted/removed creators cannot record')

    await actor(viewer)
    expect((await query('SELECT id FROM survey_observations WHERE id=$1',[first.observationId])).rowCount).toBe(1)
    expect((await query("UPDATE survey_observations SET notes='forged' WHERE id=$1 RETURNING id",[first.observationId])).rowCount).toBe(0)
    expect((await query('DELETE FROM survey_observations WHERE id=$1 RETURNING id',[first.observationId])).rowCount).toBe(0)
    check('database RLS independently permits viewer read but prevents observation mutation')
    await actor(crew,firm)
    const photo=(await query("INSERT INTO field_photos(project_id,client_id,storage_path) VALUES($1,'synthetic-photo-metadata',$2) RETURNING id",[firmProject,`synthetic-no-file/${randomUUID()}`])).rows[0]
    await actor(viewer,firm)
    expect((await query('SELECT id FROM field_photos WHERE id=$1',[photo.id])).rowCount).toBe(1)
    expect((await query("UPDATE field_photos SET caption='forged' WHERE id=$1 RETURNING id",[photo.id])).rowCount).toBe(0)
    check('the same firm-role boundary protects photo metadata; this is not an image-upload test')

    await admin()
    await query("CREATE FUNCTION qa_field_obs_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.client_id='skip-observation' THEN RETURN NULL; END IF; RETURN NEW; END $$")
    await query('CREATE TRIGGER qa_field_obs_skip BEFORE INSERT ON survey_observations FOR EACH ROW EXECUTE FUNCTION qa_field_obs_skip()')
    await query("CREATE FUNCTION qa_field_capture_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quality_metadata #>> '{raw,id}'='skip-capture' THEN RETURN NULL; END IF; RETURN NEW; END $$")
    await query('CREATE TRIGGER qa_field_capture_skip BEFORE INSERT ON observation_batches FOR EACH ROW EXECUTE FUNCTION qa_field_capture_skip()')
    for(const id of ['skip-observation','skip-capture']){
      await expect(deliver(owner,input(id))).rejects.toMatchObject({code:'FIELD_OBSERVATION_ACKNOWLEDGEMENT'})
      expect((await query('SELECT id FROM survey_observations WHERE project_id=$1 AND client_id=$2',[project,id])).rowCount).toBe(0)
    }
    check('actual silent observation/capture triggers cannot produce a receipt and leave no partial row')
    await admin()
    await query('SAVEPOINT tamper')
    await expect(query("UPDATE survey_observations SET notes='synthetic changed row' WHERE id=$1",[first.observationId])).rejects.toMatchObject({code:'23514'})
    await query('ROLLBACK TO SAVEPOINT tamper');await query('RELEASE SAVEPOINT tamper')
    expect(await deliver(owner,input('first'))).toMatchObject({replayed:true,observationId:first.observationId})
    check('the database rejects rewriting a receipted raw source and preserves valid replay')
    report.status='passed'
  }catch(error){report.status='failed';report.failure=error instanceof Error?error.message:String(error);throw error}
  finally{
    transaction.mockRestore();await query('ROLLBACK')
    expect((await query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows).toEqual(before)
    expect(await fingerprint()).toEqual(countsBefore)
    expect((await query('SELECT id FROM projects WHERE id=ANY($1::uuid[])',[[project,firmProject]])).rowCount).toBe(0)
    expect((await query('SELECT id FROM users WHERE id=ANY($1::uuid[])',[[owner,crew,viewer,stranger]])).rowCount).toBe(0)
    expect((await query("SELECT to_regprocedure('public.field_observation_project_access(uuid,boolean)') value")).rows[0].value).toBeNull()
    report.cleanup=true;await client.end();save()
  }
},90000)
