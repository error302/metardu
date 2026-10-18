import { startFieldAutoDelivery } from '../autoDelivery'

beforeEach(()=>jest.useFakeTimers())
afterEach(()=>jest.useRealTimers())

test('sync completion does not re-arm a two-second retry loop',()=>{
  const snapshot={pendingSyncCount:2,isSyncing:false}
  const session={getSnapshot:()=>snapshot,syncNow:jest.fn(async()=>undefined)}
  const stop=startFieldAutoDelivery(session)
  jest.advanceTimersByTime(2000)
  expect(session.syncNow).toHaveBeenCalledWith({automatic:true})
  snapshot.isSyncing=true
  jest.advanceTimersByTime(500)
  snapshot.isSyncing=false
  jest.advanceTimersByTime(10000)
  expect(session.syncNow).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(17500)
  expect(session.syncNow).toHaveBeenCalledTimes(2)
  stop()
  jest.advanceTimersByTime(60000)
  expect(session.syncNow).toHaveBeenCalledTimes(2)
})

test('new captures join a later pass and busy or empty sessions do not send',()=>{
  const snapshot={pendingSyncCount:0,isSyncing:false}
  const session={getSnapshot:()=>snapshot,syncNow:jest.fn(async()=>undefined)}
  const stop=startFieldAutoDelivery(session)
  jest.advanceTimersByTime(2000)
  expect(session.syncNow).not.toHaveBeenCalled()
  snapshot.pendingSyncCount=1
  snapshot.isSyncing=true
  jest.advanceTimersByTime(28000)
  expect(session.syncNow).not.toHaveBeenCalled()
  snapshot.isSyncing=false
  jest.advanceTimersByTime(30000)
  expect(session.syncNow).toHaveBeenCalledTimes(1)
  stop()
  expect(jest.getTimerCount()).toBe(0)
})
