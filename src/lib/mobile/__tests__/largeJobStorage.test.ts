/** @jest-environment node */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { offlineStorage, type FieldObservation, type PhotoData, type SyncQueueItem } from '../offlineStorage'
import { mobileObservationCapture } from '../observationCapture'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const handle=offlineStorage as unknown as {db:IDBDatabase|null;syncStateDb:IDBDatabase|null}
const factoryDescriptor=Object.getOwnPropertyDescriptor(globalThis,'indexedDB')
beforeEach(async()=>{
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()})
  handle.db=null;handle.syncStateDb=null
  await offlineStorage.init()
})
afterEach(()=>{
  handle.db?.close();handle.syncStateDb?.close();handle.db=null;handle.syncStateDb=null
  jest.restoreAllMocks()
  if(factoryDescriptor)Object.defineProperty(globalThis,'indexedDB',factoryDescriptor)
})
function database(){if(!handle.db)throw new Error('Synthetic database is not open');return handle.db}
async function seed(store:string,rows:unknown[]){
  const tx=database().transaction(store,'readwrite')
  for(const row of rows)tx.objectStore(store).add(row)
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})
}
async function records<T>(store:string):Promise<T[]>{
  const tx=database().transaction(store,'readonly'),request=tx.objectStore(store).getAll()
  return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve(request.result as T[]);tx.onabort=()=>reject(tx.error)})
}
function queued(index:number,actor:string|null=owner):SyncQueueItem {
  return {id:`q-${String(index).padStart(5,'0')}`,recordId:`capture-${index}`,ownerId:actor??undefined,type:'field_observation',action:'create',status:'failed',
    data:{id:`capture-${index}`,ownerId:actor??undefined,projectId:'synthetic-project',pointName:`P${index}`,observationType:'manual',easting:0,elevation:-2,
      rawForm:{bearing:'045.0000',note:'Original café / محطة'},timestamp:1000+index},retryCount:3,error:'Held for review',
    deliveryRetry:{attempts:3,nextAttemptAt:Date.now()+120000,blocked:true,httpStatus:409}}
}
function observation(index:number,actor:string|null=owner):FieldObservation {
  return {id:`point-${String(index*37%997).padStart(5,'0')}`,ownerId:actor??undefined,projectId:'synthetic-project',pointName:`P${index}`,observationType:'manual',
    timestamp:1000+index,easting:0,elevation:-2,notes:'Original café / محطة'}
}

test('one manual retry re-arms at most twenty failed owner records, retaining every raw value and delay',async()=>{
  const originals=[...Array.from({length:45},(_,i)=>queued(i)),queued(50,other),queued(51,null)]
  await seed('sync_queue',originals)
  await offlineStorage.retryFailedSyncItems(owner)
  const after=await records<SyncQueueItem>('sync_queue')
  expect(after.filter(row=>row.status==='pending').length).toBe(20)
  expect(after.filter(row=>row.status==='failed').length).toBe(27)
  for(const row of after){
    const before=originals.find(original=>original.id===row.id)
    expect(row.data).toEqual(before?.data)
    expect(row.deliveryRetry?.nextAttemptAt).toBe(before?.deliveryRetry?.nextAttemptAt)
    if(row.status==='pending')expect(row.deliveryRetry?.blocked).toBe(false)
    if(row.ownerId!==owner)expect(row).toEqual(before)
  }
})
test('manual retry streams failed queue records without getAll',async()=>{
  await seed('sync_queue',[queued(1)])
  const getAll=jest.spyOn(IDBObjectStore.prototype,'getAll')
  const indexGetAll=jest.spyOn(IDBIndex.prototype,'getAll')
  await offlineStorage.retryFailedSyncItems(owner)
  expect(getAll).not.toHaveBeenCalled()
  expect(indexGetAll).not.toHaveBeenCalled()
})
test('competing manual retries claim separate bounded batches in serial transactions',async()=>{
  await seed('sync_queue',Array.from({length:45},(_,i)=>queued(i)))
  await Promise.all([offlineStorage.retryFailedSyncItems(owner),offlineStorage.retryFailedSyncItems(owner)])
  expect((await records<SyncQueueItem>('sync_queue')).filter(row=>row.status==='pending').length).toBe(40)
})
test('aborting the second reset rolls back the whole retry batch, including its first record',async()=>{
  const originals=[queued(1),queued(2),queued(3)];await seed('sync_queue',originals)
  let updates=0
  const put=IDBObjectStore.prototype.put,update=IDBCursor.prototype.update
  jest.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){
    const request=put.apply(this,args)
    if(this.name==='sync_queue'&&++updates===2)this.transaction.abort()
    return request
  })
  jest.spyOn(IDBCursor.prototype,'update').mockImplementation(function(this:IDBCursor,...args){
    const request=update.apply(this,args),store=this.source instanceof IDBIndex?this.source.objectStore:this.source
    if(store.name==='sync_queue'&&++updates===2)store.transaction.abort()
    return request
  })
  await expect(offlineStorage.retryFailedSyncItems(owner)).rejects.toThrow()
  expect(await records<SyncQueueItem>('sync_queue')).toEqual(originals)
})

async function reviewedLegacy(){
  const row=observation(250,null) as FieldObservation&{id:string;timestamp:number}
  const hash=await observationDeliveryHash(mobileObservationCapture(row))
  row.deliveryReceipt={ok:true,id:row.id,observationId:other,batchId:owner,inputHash:hash,fieldVerified:false,replayed:false,
    legacyRecoveryReview:{version:'unknown-author-v1',reviewedBy:owner,reviewedAt:'2026-10-24T12:00:00Z',sourceHash:hash,capturedBy:null}}
  return row
}
test('large-job stats stream photo/queue payloads, count only visible sources and retain verified legacy attribution',async()=>{
  const legacy=await reviewedLegacy(),observations=[...Array.from({length:151},(_,i)=>observation(i)),observation(201,other),observation(202,null),legacy]
  const photos:PhotoData[]=Array.from({length:96},(_,i)=>({id:`photo-${i}`,ownerId:i%2?owner:other,projectId:'synthetic-project',data:'data:image/jpeg;base64,'+'A'.repeat(65536)}))
  const queue=Array.from({length:1000},(_,i)=>({...queued(i,i%2?owner:other),status:(i%3?'pending':'failed') as SyncQueueItem['status']}))
  await seed('field_observations',observations);await seed('photos',photos);await seed('sync_queue',queue)
  const getAll=jest.spyOn(IDBObjectStore.prototype,'getAll')
  const transactions=jest.spyOn(database(),'transaction')
  const stats=await offlineStorage.getStorageStats(owner)
  expect(stats).toMatchObject({observations:152,photos:48,pendingSync:333,failedSync:167})
  expect(stats.storageUsed).toMatch(/MB$/)
  expect(getAll).not.toHaveBeenCalled()
  expect(transactions.mock.calls.every(([,mode])=>mode==='readonly')).toBe(true)
  expect(legacy.ownerId).toBeUndefined()
})
test('a corrupt legacy receipt cannot inflate the visible-owner count',async()=>{
  const legacy=await reviewedLegacy();legacy.easting=99
  await seed('field_observations',[legacy,observation(1)])
  expect((await offlineStorage.getStorageStats(owner)).observations).toBe(1)
})
test('bounded recent readings use capture timestamps, rather than random ID order, across storage pages',async()=>{
  const rows=Array.from({length:151},(_,i)=>observation(i))
  await seed('field_observations',[...rows,observation(222,other),observation(223,null)])
  const getAll=jest.spyOn(IDBObjectStore.prototype,'getAll')
  const recent=await Reflect.apply(offlineStorage.getFieldObservations,offlineStorage,['synthetic-project',owner,10]) as FieldObservation[]
  expect(recent.length).toBe(10)
  expect(recent.map(row=>row.pointName)).toEqual(Array.from({length:10},(_,i)=>`P${150-i}`))
  expect(getAll).not.toHaveBeenCalled()
})
test('signed-out reads and retries do not open or scan any stored owner data',async()=>{
  const transaction=jest.spyOn(database(),'transaction')
  await offlineStorage.retryFailedSyncItems()
  expect(await offlineStorage.getStorageStats()).toMatchObject({observations:0,photos:0,pendingSync:0,failedSync:0})
  expect(await offlineStorage.getFieldObservations('synthetic-project')).toEqual([])
  expect(transaction).not.toHaveBeenCalled()
})

test('parallel first reads share one version-1 connection instead of leaking earlier connections',async()=>{
  database().close();handle.db=null
  const open=jest.spyOn(indexedDB,'open')
  await Promise.all([offlineStorage.init(),offlineStorage.getStorageStats(owner),
    Reflect.apply(offlineStorage.getFieldObservations,offlineStorage,['synthetic-project',owner,10]) as Promise<FieldObservation[]>])
  expect(open.mock.calls.filter(([name])=>name==='MetarduFieldDB').length).toBe(1)
  const oldClient=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('MetarduFieldDB',1)
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
  })
  try {
    expect(oldClient.version).toBe(1)
    expect([...oldClient.objectStoreNames]).toEqual(['field_observations','photos','projects_offline','survey_points','sync_queue'])
  } finally {oldClient.close()}
})

test('explicit unlimited reads still return every owned original without a recent-view truncation',async()=>{
  const rows=Array.from({length:151},(_,i)=>observation(i))
  await seed('field_observations',rows)
  const read=await offlineStorage.getFieldObservations('synthetic-project',owner)
  expect(read.length).toBe(151)
  expect(read.map(row=>row.id).sort()).toEqual(rows.map(row=>row.id).sort())
})

test.each(['field_observations','photos','sync_queue'])('aborted %s statistics refuse a partial count and preserve every stored row',async storeName=>{
  const rows={field_observations:[observation(1)],photos:[{id:'photo',ownerId:owner,projectId:'synthetic-project',data:'original-photo'}],sync_queue:[queued(1)]}
  for(const [name,values] of Object.entries(rows))await seed(name,values)
  let injected=false
  const open=IDBObjectStore.prototype.openCursor
  jest.spyOn(IDBObjectStore.prototype,'openCursor').mockImplementation(function(this:IDBObjectStore,...args){
    const request=open.apply(this,args)
    if(this.name===storeName)request.addEventListener('success',()=>{
      if(!injected){injected=true;queueMicrotask(()=>this.transaction.abort())}
    })
    return request
  })
  await expect(offlineStorage.getStorageStats(owner)).rejects.toThrow()
  expect(injected).toBe(true)
  for(const [name,values] of Object.entries(rows))expect(await records(name)).toEqual(values)
})

test('reviewed unknown-author retries retain attribution, and contradictory or other-reviewer ownership stays held',async()=>{
  const legacy=queued(1,null)
  legacy.recoveryReview={version:'unknown-author-v1',actorId:owner,projectId:'synthetic-project',sourceHash:'a'.repeat(64),reviewedAt:'2026-10-24T12:00:00Z',capturedBy:null}
  const conflict={...queued(2),ownerId:other},foreign={...queued(3,null),recoveryReview:{...legacy.recoveryReview,actorId:other}}
  await seed('sync_queue',[legacy,conflict,foreign]);await offlineStorage.retryFailedSyncItems(owner)
  const after=await records<SyncQueueItem>('sync_queue')
  expect(after[0]).toMatchObject({status:'pending',recoveryReview:legacy.recoveryReview,data:legacy.data})
  expect(after[0].ownerId).toBeUndefined()
  expect(after[1]).toEqual(conflict);expect(after[2]).toEqual(foreign)
})
