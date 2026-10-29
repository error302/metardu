/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const id='11111111-1111-4111-8111-111111111111'
function worker(){
 const handlers:Record<string,(event:unknown)=>void>={}
 const showNotification=jest.fn<Promise<void>,[string,{body:string;data:{url:string}}]>().mockResolvedValue(undefined),openWindow=jest.fn(),focus=jest.fn(),fetch=jest.fn()
 const windows=[{url:'https://metardu.space/cad',focus}]
 runInNewContext(readFileSync('public/survey-push.js','utf8'),{URL,console,fetch,self:{location:{origin:'https://metardu.space'},addEventListener:(name:string,fn:(event:unknown)=>void)=>handlers[name]=fn,registration:{showNotification},clients:{matchAll:async()=>windows,openWindow}}})
 async function dispatch(type:string,event:Record<string,unknown>){let done=Promise.resolve();handlers[type]({...event,waitUntil:(promise:Promise<void>)=>done=promise});await done}
 return {dispatch,showNotification,openWindow,focus,fetch,windows}
}
it('resolves project details only through the current authenticated session',async()=>{
 const w=worker()
 w.fetch.mockResolvedValue({ok:true,json:async()=>({title:'Survey scheduled: Mwavumbo',body:'Boundary pickup · 3 Nov 2026, 09:00 (Africa/Nairobi)',url:'/schedule?job='+id})})
 await w.dispatch('push',{data:{json:()=>({outboxId:id})}})
 expect(w.fetch).toHaveBeenCalledWith('/api/push/messages/'+id,{credentials:'include',cache:'no-store',redirect:'error'})
 expect(w.showNotification).toHaveBeenCalledWith('Survey scheduled: Mwavumbo',expect.objectContaining({body:'Boundary pickup · 3 Nov 2026, 09:00 (Africa/Nairobi)',data:{url:'https://metardu.space/schedule?job='+id}}))
})
it('displays a generic reminder after logout or invalid payload, never supplied project details',async()=>{
 const w=worker();w.fetch.mockResolvedValue({ok:false,status:401})
 await w.dispatch('push',{data:{json:()=>({outboxId:id,title:'PRIVATE PROJECT'})}})
 expect(w.showNotification.mock.calls[0][0]).toBe('METARDU survey reminder')
 expect(w.showNotification.mock.calls[0][1].body).not.toContain('PRIVATE')
 await w.dispatch('push',{data:{json:()=>({outboxId:'../private'})}})
 expect(w.fetch).toHaveBeenCalledTimes(1)
})
it('never replaces an unrelated working tab and rejects an external click URL',async()=>{
 const w=worker(),close=jest.fn()
 await w.dispatch('notificationclick',{notification:{close,data:{url:'https://evil.invalid/schedule'}}})
 expect(close).toHaveBeenCalled()
 expect(w.openWindow).toHaveBeenCalledWith('https://metardu.space/schedule')
 expect(w.focus).not.toHaveBeenCalled()
 w.windows.push({url:'https://metardu.space/schedule?job='+id,focus:w.focus})
 await w.dispatch('notificationclick',{notification:{close,data:{url:'/schedule?job='+id}}})
 expect(w.focus).toHaveBeenCalledTimes(1)
 expect(w.openWindow).toHaveBeenCalledTimes(1)
})
it('advertises capability to the page only through the active worker message port',async()=>{
 const w=worker(),postMessage=jest.fn()
 await w.dispatch('message',{data:{type:'METARDU_PUSH_CAPABILITY'},ports:[{postMessage}]})
 expect(postMessage).toHaveBeenCalledWith({version:1,reminderPush:true})
})
