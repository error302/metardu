import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
export const EXPECTED_CASES=17
export async function verifyBoundaryRequests(c){
  const {check,pool,actor,other,project,secondProject,parcel,traverse,command,save,get,state,schema,require,randomUUID,setFault}=c
  assert.match(schema,/^metardu_boundary_[a-f0-9]{32}$/)
  const {NextRequest}=require('next/server'),route=require('../src/app/api/project/[id]/scheme/parcel-boundary/route.ts'),{canonicalJSON}=require('../src/lib/audit/auditHash.ts')
  const body=async()=>({...await command(),expected_user_id:actor})
  const data=async response=>{assert.equal(response.status,200,await response.clone().text());return(await response.json()).data}
  const cancel=(b,user=actor,p=project)=>route.POST(new NextRequest('http://127.0.0.1:3021/api/project/'+p+'/scheme/parcel-boundary?action=cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),user,p)
  const recover=(id,user=actor,p=project)=>get({parcel_id:parcel,request_id:id,mode:'request',expected_user_id:user},user,p)
  const intent=(b,inputHash)=>({expected_user_id:b.expected_user_id,parcel_id:b.parcel_id,request_id:b.request_id,input_hash:inputHash})
  const hash=b=>require('node:crypto').createHash('sha256').update(canonicalJSON({protocol:'reviewed-parcel-boundary-v1',project,command:b})).digest('hex')
  const requestRows=async()=>Number((await pool.query('SELECT COUNT(*) n FROM parcel_boundary_requests')).rows[0].n)
  const installed=(await pool.query("SELECT to_regclass('parcel_boundary_requests') present")).rows[0].present!==null
  if(installed)await pool.query("CREATE FUNCTION fixture_boundary_request_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('metardu_fixture.boundary_fault',true)='boundary_journal_suppress' THEN RETURN NULL;END IF;IF current_setting('metardu_fixture.boundary_fault',true)='boundary_journal_change' THEN NEW.receipt=jsonb_set(NEW.receipt,'{areaHa}','999');END IF;RETURN NEW;END $$;CREATE TRIGGER fixture_boundary_request_fault BEFORE INSERT ON parcel_boundary_requests FOR EACH ROW EXECUTE FUNCTION fixture_boundary_request_fault()")
  const cases=[],test=(name,work)=>cases.push([name,work])
  test('boundary commands require the intended authenticated actor before any write',async()=>{
    const b=await body(),{expected_user_id:_old,...missing}=b,before=await state()
    assert.equal((await save(missing)).status,400);assert.equal((await save({...b,expected_user_id:other})).status,403)
    assert.deepEqual(await state(),before)
  })
  test('a committed boundary and its final request mirror commit together and recover exactly',async()=>{
    const b=await body(),r=await data(await save(b)),outcome=await data(await recover(b.request_id))
    assert.equal(r.actorId,actor);assert.equal(outcome.state,'committed');assert.equal(outcome.actorId,actor);assert.equal(outcome.inputHash,hash(b));assert.deepEqual(outcome.receipt,r)
    const row=(await pool.query('SELECT * FROM parcel_boundary_requests WHERE actor_id=$1 AND request_id=$2',[actor,b.request_id])).rows[0]
    assert.equal(row.draft_id,r.receiptId);assert.equal(row.state,'committed');assert.deepEqual(row.receipt,r)
    assert.deepEqual(await data(await get({request_id:b.request_id})),r)
    assert.deepEqual(await data(await save(b)),r);assert.equal(await requestRows(),1)
  })
  test('changed boundary intent and mixed request recovery scopes are refused',async()=>{
    const b=await body();await data(await save(b));const before=await state()
    assert.equal((await save({...b,note:'Changed intent'})).status,409)
    assert.equal((await get({request_id:b.request_id,mode:'request',traverse_id:traverse,expected_user_id:actor})).status,400)
    assert.equal((await get({request_id:b.request_id,mode:'request'})).status,400)
    assert.equal((await recover(b.request_id,other)).status,404)
    assert.equal((await recover(b.request_id,actor,secondProject)).status,404)
    assert.deepEqual(await state(),before)
  })
  test('durable boundary cancellation blocks late geometry and remains exactly recoverable',async()=>{
    const b=await body(),before=await state(),r=await data(await cancel(intent(b,hash(b))))
    assert.equal(r.state,'cancelled');assert.equal(r.actorId,actor);assert.equal(r.inputHash,hash(b))
    assert.deepEqual(await data(await cancel(intent(b,hash(b)))),r);assert.deepEqual(await data(await recover(b.request_id)),r)
    assert.equal((await save(b)).status,409);assert.equal(await requestRows(),1)
    const after=await state();assert.deepEqual(after.parcels,before.parcels);assert.deepEqual(after.parcel_boundary_drafts,before.parcel_boundary_drafts)
  })
  test('cancelling an already committed boundary returns the original retained receipt',async()=>{
    const b=await body(),r=await data(await save(b)),before=await state(),outcome=await data(await cancel(intent(b,hash(b))))
    assert.equal(outcome.state,'committed');assert.deepEqual(outcome.receipt,r);assert.deepEqual(await state(),before)
  })
  test('simultaneous boundary save and cancellation settle one final graph',async()=>{
    const b=await body(),results=await Promise.all([save(b),cancel(intent(b,hash(b)))])
    assert.ok(results.every(r=>[200,409].includes(r.status)))
    const outcome=await data(await recover(b.request_id));assert.equal(await requestRows(),1)
    const count=Number((await pool.query('SELECT COUNT(*) n FROM parcel_boundary_drafts')).rows[0].n)
    assert.equal(count,outcome.state==='committed'?1:0)
  })
  test('unavailable boundary request storage disables saving and never fabricates empty recovery',async()=>{
    assert.equal(installed,true);const b=await body(),before=await state()
    try{
      await pool.query('ALTER TABLE parcel_boundary_requests RENAME TO fixture_unavailable_boundary_requests')
      assert.equal((await data(await get({traverse_id:traverse}))).storageReady,false)
      assert.equal((await save(b)).status,503);assert.equal((await cancel(intent(b,hash(b)))).status,503);assert.equal((await recover(b.request_id)).status,503)
    }finally{await pool.query('ALTER TABLE fixture_unavailable_boundary_requests RENAME TO parcel_boundary_requests')}
    assert.deepEqual(await state(),before)
  })
  for(const fault of ['boundary_journal_suppress','boundary_journal_change'])test(fault+' rolls back geometry, audit and retained boundary',async()=>{
    const b=await body(),before=await state()
    try{setFault(fault);assert.ok((await save(b)).status>=500)}finally{setFault('')}
    assert.deepEqual(await state(),before);assert.equal(await requestRows(),0)
  })
  test('retained boundary outcomes refuse update and direct deletion while their project exists',async()=>{
    const b=await body();await data(await save(b))
    for(const sql of ["UPDATE parcel_boundary_requests SET receipt=jsonb_set(receipt,'{areaHa}','999')",'DELETE FROM parcel_boundary_requests'])await assert.rejects(pool.query(sql),e=>e.code==='42501')
    assert.equal(await requestRows(),1)
  })
  test('boundary request RLS isolates issuer reads and refuses forged actors',async()=>{
    const b=await body();await data(await save(b));const client=await pool.connect()
    try{
      await client.query('BEGIN');await client.query('GRANT USAGE ON SCHEMA '+schema+' TO authenticated;GRANT SELECT ON projects,parcels,parcel_boundary_drafts TO authenticated')
      await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.user_id',$1,true)",[other])
      assert.equal((await client.query('SELECT * FROM parcel_boundary_requests')).rows.length,0)
      await client.query("SELECT set_config('request.user_id',$1,true)",[actor])
      assert.equal((await client.query('SELECT * FROM parcel_boundary_requests')).rows.length,1)
      const fake={state:'cancelled',actorId:other,projectId:project,parcelId:parcel,requestId:randomUUID(),inputHash:'a'.repeat(64)}
      await assert.rejects(client.query("INSERT INTO parcel_boundary_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,receipt) VALUES($1,$2,$3,$4,$5,'cancelled',$6)",[other,fake.requestId,project,parcel,fake.inputHash,JSON.stringify(fake)]),e=>e.code==='42501')
    }finally{await client.query('ROLLBACK');client.release()}
  })
  test('a cancelled boundary request cannot acquire a late draft through direct SQL',async()=>{
    const b=await body();await data(await cancel(intent(b,hash(b))));const client=await pool.connect()
    try{
      await client.query('BEGIN')
      await assert.rejects(async()=>{await client.query("INSERT INTO parcel_boundary_drafts(id,actor_id,request_id,project_id,parcel_id,traverse_id,input_hash,evidence_hash,snapshot,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','{}')",[randomUUID(),actor,b.request_id,project,parcel,traverse,hash(b),b.evidence_hash]);await client.query('SET CONSTRAINTS ALL IMMEDIATE')},e=>['23503','23514'].includes(e.code))
    }finally{await client.query('ROLLBACK');client.release()}
  })
  test('a boundary draft cannot commit without its final request graph',async()=>{
    const b=await body(),client=await pool.connect()
    try{
      await client.query('BEGIN')
      await assert.rejects(async()=>{await client.query("INSERT INTO parcel_boundary_drafts(id,actor_id,request_id,project_id,parcel_id,traverse_id,input_hash,evidence_hash,snapshot,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}','{}')",[randomUUID(),actor,b.request_id,project,parcel,traverse,hash(b),b.evidence_hash]);await client.query('SET CONSTRAINTS ALL IMMEDIATE')},e=>['23503','23514'].includes(e.code))
    }finally{await client.query('ROLLBACK');client.release()}
  })
  test('ownership transfer closes former boundary recovery and preserves issuer history',async()=>{
    const b=await body();await data(await save(b));await pool.query('UPDATE projects SET user_id=$2 WHERE id=$1',[project,other])
    assert.equal((await recover(b.request_id)).status,404);assert.equal(await requestRows(),1)
    await assert.rejects(pool.query('DELETE FROM users WHERE id=$1',[actor]),e=>e.code==='23503')
  })
  async function rehearseBackfill(malformed){
    const b=await body(),r=await data(await save(b)),client=await pool.connect()
    try{
      await client.query('BEGIN');await client.query('DROP TABLE '+schema+'.parcel_boundary_requests CASCADE')
      for(const name of ['guard_boundary_request_immutable','check_boundary_request_graph'])await client.query('DROP FUNCTION '+schema+'.'+name+'() CASCADE')
      await client.query('ALTER TABLE '+schema+'.parcel_boundary_drafts DISABLE TRIGGER parcel_boundary_draft_immutable')
      const legacy={...r};delete legacy.actorId;if(malformed)delete legacy.requestId
      await client.query('UPDATE parcel_boundary_drafts SET receipt=$2::jsonb WHERE id=$1',[r.receiptId,JSON.stringify(legacy)])
      await client.query('ALTER TABLE '+schema+'.parcel_boundary_drafts ENABLE TRIGGER parcel_boundary_draft_immutable')
      const ddl=readFileSync('src/lib/db/migrations/123_boundary_request_recovery.sql','utf8').split('-- DOWN:')[0].replaceAll('public.',schema+'.').replaceAll('search_path=pg_catalog,public',`search_path=pg_catalog,${schema}`)
      if(malformed)await assert.rejects(client.query(ddl),e=>e.code==='23514')
      else{
        await client.query(ddl)
        const mirrored=(await client.query('SELECT receipt,state,draft_id FROM parcel_boundary_requests WHERE actor_id=$1 AND request_id=$2',[actor,b.request_id])).rows[0]
        assert.equal(mirrored.state,'committed');assert.equal(mirrored.draft_id,r.receiptId);assert.deepEqual(mirrored.receipt,legacy)
      }
    }finally{await client.query('ROLLBACK');client.release()}
  }
  test('migration 123 mirrors historical boundary receipts without rewriting them',()=>rehearseBackfill(false))
  test('migration 123 refuses an inconsistent historical receipt instead of inventing identity',()=>rehearseBackfill(true))
  test('an inconsistent final boundary journal is refused during recovery',async()=>{
    const b=await body();await data(await save(b));const client=await pool.connect()
    try{
      await client.query('BEGIN');await client.query('ALTER TABLE '+schema+'.parcel_boundary_requests DISABLE TRIGGER boundary_request_immutable')
      await client.query("UPDATE parcel_boundary_requests SET receipt=jsonb_set(receipt,'{areaHa}','999') WHERE actor_id=$1 AND request_id=$2",[actor,b.request_id])
      const api=require('../src/lib/scheme/boundaryRequests.ts')
      await assert.rejects(api.readBoundaryRequestOutcome(actor,project,parcel,b.request_id,client),e=>e.statusCode===500)
    }finally{await client.query('ROLLBACK');client.release()}
  })
  assert.equal(cases.length,EXPECTED_CASES)
  for(const [name,work] of cases)await check(name,work)
}
