import{checkSurveyWorkerUpdate,pushWorkerReady}from'./pushClient'
import{enableSurveyPush}from'./pushClient'
jest.mock('@/lib/api/client',()=>({apiPost:jest.fn()}))
const originalContainer=Object.getOwnPropertyDescriptor(navigator,'serviceWorker'),originalChannel=Object.getOwnPropertyDescriptor(globalThis,'MessageChannel'),originalNotification=Object.getOwnPropertyDescriptor(window,'Notification')
const ports:Array<{onmessage:((event:MessageEvent<unknown>)=>void)|null;close:jest.Mock}>=[]
function fixture(capable=false){
 const postMessage=jest.fn(()=>{ports.at(-1)?.onmessage?.({data:{reminderPush:capable}} as MessageEvent<unknown>)})
 const active=Object.assign(new EventTarget(),{state:'activated',postMessage})
 const registration=Object.assign(new EventTarget(),{active,waiting:null as ServiceWorker|null,installing:null as ServiceWorker|null,update:jest.fn<Promise<void>,[]>().mockResolvedValue(undefined)})
 const container={getRegistration:jest.fn().mockResolvedValue(registration)}
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:container})
 return{registration,container,active,postMessage,api:registration as unknown as ServiceWorkerRegistration}
}
beforeEach(()=>{
 jest.useFakeTimers();ports.length=0
 Object.defineProperty(globalThis,'MessageChannel',{configurable:true,value:class{port1={onmessage:null as((event:MessageEvent<unknown>)=>void)|null,close:jest.fn()};port2={};constructor(){ports.push(this.port1)}}})
 Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'default',requestPermission:jest.fn()}})
})
afterEach(()=>{
 jest.useRealTimers();for(const[target,key,descriptor]of[[navigator,'serviceWorker',originalContainer],[globalThis,'MessageChannel',originalChannel],[window,'Notification',originalNotification]] as const){if(descriptor)Object.defineProperty(target,key,descriptor);else Reflect.deleteProperty(target,key)}
})
it('returns a capable active worker without permission, download, activation or reload',async()=>{
 const f=fixture(true)
 await expect(checkSurveyWorkerUpdate()).resolves.toBe('ready')
 expect(f.registration.update).not.toHaveBeenCalled();expect(Notification.requestPermission).not.toHaveBeenCalled();expect(f.postMessage).toHaveBeenCalledWith({type:'METARDU_PUSH_CAPABILITY'},expect.any(Array));expect(jest.getTimerCount()).toBe(0)
})
it('reviews an existing waiting update without downloading again or sending SKIP_WAITING',async()=>{
 const f=fixture(),waiting=Object.assign(new EventTarget(),{state:'installed',postMessage:jest.fn()})
 f.registration.waiting=waiting as unknown as ServiceWorker
 await expect(checkSurveyWorkerUpdate()).resolves.toBe('waiting')
 expect(f.registration.update).not.toHaveBeenCalled();expect(waiting.postMessage).not.toHaveBeenCalled();expect(Notification.requestPermission).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0)
})
it('observes a requested download becoming ready without activating it',async()=>{
 const f=fixture(),worker=Object.assign(new EventTarget(),{state:'installing',postMessage:jest.fn()})
 f.registration.installing=worker as unknown as ServiceWorker
 const remove=jest.spyOn(worker,'removeEventListener'),result=checkSurveyWorkerUpdate()
 await jest.advanceTimersByTimeAsync(0)
 expect(f.registration.update).toHaveBeenCalledTimes(1)
 worker.state='installed';f.registration.waiting=worker as unknown as ServiceWorker;worker.dispatchEvent(new Event('statechange'))
 await expect(result).resolves.toBe('waiting');expect(worker.postMessage).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledWith('statechange',expect.any(Function));expect(jest.getTimerCount()).toBe(0)
})
it('times out an installation and removes observers without changing notification permission',async()=>{
 const f=fixture(),worker=Object.assign(new EventTarget(),{state:'installing',postMessage:jest.fn()})
 f.registration.installing=worker as unknown as ServiceWorker
 const remove=jest.spyOn(worker,'removeEventListener'),assertion=expect(checkSurveyWorkerUpdate({timeoutMs:50})).rejects.toThrow(/timed out.*has not reloaded/)
 await jest.advanceTimersByTimeAsync(51);await assertion
 expect(remove).toHaveBeenCalledWith('statechange',expect.any(Function));expect(worker.postMessage).not.toHaveBeenCalled();expect(Notification.requestPermission).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0)
})
it('cancels a silent capability probe and cleans its channel/timer',async()=>{
 const f=fixture(),controller=new AbortController();f.postMessage.mockImplementation(()=>{})
 const result=pushWorkerReady(f.api,{signal:controller.signal});controller.abort()
 await expect(result).resolves.toBe(false);expect(ports[0].close).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0)
})
it('handles postMessage failure without leaking its capability timeout',async()=>{
 const f=fixture();f.postMessage.mockImplementation(()=>{throw new Error('worker unavailable')})
 await expect(pushWorkerReady(f.api)).resolves.toBe(false);expect(ports[0].close).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0)
})
it('cancels a pending update check and does not continue after its download eventually resolves',async()=>{
 const f=fixture(),controller=new AbortController();let release!:()=>void
 f.registration.update.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve}))
 const assertion=expect(checkSurveyWorkerUpdate({signal:controller.signal})).rejects.toThrow(/cancelled/)
 await jest.advanceTimersByTimeAsync(0);controller.abort();await assertion;release();await jest.advanceTimersByTimeAsync(0)
 expect(f.postMessage).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0)
})
it('reports no registration and failed downloads with safe user-facing errors',async()=>{
 const f=fixture();f.container.getRegistration.mockResolvedValue(undefined)
 await expect(checkSurveyWorkerUpdate()).rejects.toThrow(/still initializing/)
 f.container.getRegistration.mockResolvedValue(f.registration);f.registration.update.mockRejectedValue(new Error('private endpoint and token must not escape'))
 await expect(checkSurveyWorkerUpdate()).rejects.toThrow('App update could not be checked. Your page has not reloaded; try again when connected.');expect(jest.getTimerCount()).toBe(0)
})
it('retains the direct permission gesture for enabling, separate from update checks',async()=>{
 fixture();jest.mocked(Notification.requestPermission).mockResolvedValue('denied')
 await expect(enableSurveyPush('synthetic-key')).rejects.toThrow(/not allowed/);expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
})
