/** @jest-environment node */
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import Papa from 'papaparse'
import { createSetoutCaptureSnapshot } from '@/lib/field/setoutCapture'
import { exportProjectSetoutCsv,type SavedShotRow } from '@/lib/reports/projectSetoutCsv'
import { generateProjectSetoutPdf,SETOUT_PDF_FONT_FILE } from '@/lib/reports/projectSetoutPdf'
import { generateProjectSetoutHtml } from '@/lib/reports/projectSetoutHtml'
import { db } from '@/lib/db'
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
const fixtureCrs='EPSG:21037'
const capture=createSetoutCaptureSnapshot({projectId:'synthetic-project',definitionId:'synthetic-definition',pointId:'synthetic-point',pointLabel:'P1',designRevision:1,horizontalCrs:fixtureCrs,definitionCrs:fixtureCrs,deviceCrs:fixtureCrs,verticalDatum:'Synthetic BM',deviceVerticalDatum:'Synthetic BM',capturedAt:'2026-10-14T06:00:00Z',design:{easting:500000,northing:9800000,rl:100},capturedDesign:{easting:500000,northing:9800000,rl:100},observed:{easting:500000.0001234567,northing:9800000,rl:100.000003},reportedAccuracyM:null,reportedVerticalAccuracyM:null,profile:null})
const row:SavedShotRow={id:'synthetic-shot',project_id:capture.projectId,definition_id:capture.definitionId,definition_name:'Synthetic raw observations',definition_crs:fixtureCrs,design_revision:1,setout_point_id:capture.pointId,label:'P1',design_easting:500000,design_northing:9800000,design_rl:100,observed_easting:500000,observed_northing:9800000,observed_rl:100,d_e:0,d_n:0,d_z:0,horizontal_error:0,vertical_error:0,threshold_h:null,threshold_v:null,result:'INFO',reported_accuracy_m:null,tolerance_profile_id:null,tolerance_version:null,instrument:null,instrument_serial:null,operator_name:null,crew:null,observation_batch_id:null,staked_by:'synthetic-user',staked_at:'2026-10-14T06:00:05Z',notes:'Synthetic verification only; no field acceptance.',client_shot_id:'synthetic-device-shot',capture_snapshot:capture}
it('exports original v2 values with blank thresholds rather than rounded legacy columns or invented limits',async()=>{
  ;(db.query as jest.Mock).mockResolvedValue({rows:[row]})
  const exported=await exportProjectSetoutCsv(row.project_id,row.definition_id,1)
  const parsed=Papa.parse<Record<string,string>>(exported.csv??'',{header:true}).data[0]
  expect(parsed.Observed_E_m).toBe('500000.0001234567')
  expect(parsed.Recorded_H_Tolerance_m).toBe('')
  expect(parsed.Recorded_V_Tolerance_m).toBe('')
  expect(parsed.Recorded_Status).toBe('INFO')
  expect(parsed.Reported_V_Accuracy_m).toBe('')
  expect(parsed.Capture_Schema_Version).toBe('2')
  expect(parsed.Numerical_Eligibility_Issues).toMatch(/criteria|profile/i)
})
it('renders a native draft PDF and standalone HTML retaining unassessed evidence',async()=>{
  const font=readFileSync('public/fonts/'+SETOUT_PDF_FONT_FILE),logo=readFileSync('public/metardu-icon.png')
  const pdf=await generateProjectSetoutPdf([row],{revision:1,synthetic:true,font,logo})
  const document=await PDFDocument.load(pdf)
  expect(document.getPages().length).toBeGreaterThan(0)
  expect(document.getPages().length).toBeLessThanOrEqual(3)
  mkdirSync('.cache/release-verify',{recursive:true})
  writeFileSync('.cache/release-verify/setout-current-unassessed.pdf',pdf)
  writeFileSync('.cache/release-verify/setout-current-unassessed.html',generateProjectSetoutHtml([row],{revision:1,synthetic:true,logoDataUrl:'data:image/png;base64,'+logo.toString('base64')}))
})
