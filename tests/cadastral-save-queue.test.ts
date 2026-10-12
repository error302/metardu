/** @jest-environment node */
import {flushFieldBook,registerFieldBookFlush,trackFieldBookSave} from '@/lib/survey/fieldBookSaveQueue'
test('computation waits for the newest queued save',async()=>{
 let finish!:(v:boolean)=>void
 const first=new Promise<boolean>(resolve=>finish=resolve)
 trackFieldBookSave('ordered',first)
 const waiting=flushFieldBook('ordered')
 trackFieldBookSave('ordered',Promise.resolve(false))
 finish(true)
 expect(await waiting).toBe(false)
})
test('pending cell edits are flushed before computation',async()=>{
 let saved=false
 const unregister=registerFieldBookFlush('dirty',async()=>{saved=true;return true})
 expect(await flushFieldBook('dirty')).toBe(true)
 expect(saved).toBe(true)
 unregister()
})
test('a failed save blocks computation',async()=>{
 trackFieldBookSave('failed',Promise.resolve(false))
 expect(await flushFieldBook('failed')).toBe(false)
})
