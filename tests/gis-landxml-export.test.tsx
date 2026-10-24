/** @jest-environment jsdom */
import type {ReactNode} from 'react'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import GISExportPage from '@/app/tools/gis-export/page'
import {parseLandXML} from '@/lib/import/totalStation/parseLandXML'
const mockProject={id:'synthetic-gis',name:'SYNTHETIC retained heights',datum:'WGS84',utm_zone:37,hemisphere:'S'}
const mockPoints=[{name:'SYNTHETIC unknown',easting:500000,northing:9800000,elevation:null as number|null,is_control:false},
  {name:'SYNTHETIC zero',easting:500010,northing:9800010,elevation:0,is_control:false}]
jest.mock('@/lib/api-client/client',()=>({createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-owner'}}}})},
  from:(table:string)=>{
    const response=Promise.resolve({data:table==='projects'?[mockProject]:table==='survey_points'?mockPoints:[]})
    const builder=Object.assign(response,{select:()=>builder,eq:()=>builder,order:()=>builder,limit:()=>builder})
    return builder
  },
})}))
jest.mock('@/components/shared/ToolGate',()=>({ToolGate:({children}:{children:ReactNode})=>children}))
jest.mock('@/components/shared/PageHeader',()=>({PageHeader:()=>null}))
jest.mock('@/lib/i18n/LanguageContext',()=>({useLanguage:()=>({t:(key:string)=>key})}))
test.each([false,true])('GIS LandXML delivers retained heights or reports duplicate names before download (duplicate=%s)',async duplicate=>{
  const originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL')
  let captured:Blob|undefined
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:(blob:Blob)=>{captured=blob;return 'blob:synthetic-gis'}})
  const click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  const previousName=mockPoints[1].name
  if(duplicate)mockPoints[1].name=mockPoints[0].name
  const page=render(<GISExportPage/> )
  try{
    const selector=await screen.findByRole('combobox')
    await act(async()=>fireEvent.change(selector,{target:{value:'synthetic-gis'}}))
    await waitFor(()=>expect(screen.getByText(/2 points/)).toBeTruthy())
    const card=screen.getByRole('heading',{name:'LandXML'}).parentElement
    if(!card)throw new Error('LandXML export card missing')
    await act(async()=>fireEvent.click(within(card).getByRole('button',{name:'Download'})))
    if(duplicate){
      expect(captured).toBeUndefined()
      expect(screen.getByRole('alert').textContent).toMatch(/duplicate|unique/i)
      expect(within(card).queryByText('Downloaded')).toBeNull()
      return
    }
    if(!captured)throw new Error('No XML artifact was downloaded')
    const blob=captured
    const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob)})
    const parsed=parseLandXML(text)
    expect(parsed.errors).toEqual([])
    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0].elevation).toBeUndefined()
    expect(parsed.records[1].elevation).toBe(0)
  }finally{
    page.unmount();click.mockRestore();mockPoints[1].name=previousName
    if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else Reflect.deleteProperty(URL,'createObjectURL')
  }
})
