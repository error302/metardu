/** @jest-environment jsdom */
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import DynamicFieldBook from '@/components/workspace/DynamicFieldBook'
import {flushFieldBook} from '@/lib/survey/fieldBookSaveQueue'

test.skip('a control edit made during the row debounce is included in the saved observation snapshot',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 jest.useFakeTimers()
 const originalFetch=global.fetch
 const bodies:any[]=[]
 global.fetch=jest.fn(async(url,options:any)=>{
   if(options?.method==='PUT'){bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({})} as Response}
   return {ok:true,json:async()=>String(url).endsWith('/fieldbook') ? {data:[{station:'A1',raw_data:{station:'A1',target:'A2',bearing:'0',distance:'80',distanceType:'grid'}}]} : {data:{boundary_data:{startControl:{name:'A1',easting:500000,northing:9900000}}}}} as Response
 })
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host)
 try {
  await act(async()=>root.render(<DynamicFieldBook projectId="control-race" surveyType="cadastral"/>))
  const edit=async(label:string,value:string)=>act(async()=>{
   const input=host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value)
   input.dispatchEvent(new Event('input',{bubbles:true}))
  })
  await edit('Distance (m)','81')
  await edit('Control easting (m)','500001')
  await act(async()=>{jest.advanceTimersByTime(500)})
  expect(await flushFieldBook('control-race')).toBe(true)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].startPoint.easting).toBe(500001)
  expect(bodies[0].rows[0].distance).toBe('81')
 } finally {
  await act(async()=>root.unmount());host.remove();global.fetch=originalFetch;jest.useRealTimers()
 }
})
