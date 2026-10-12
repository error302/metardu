/** @jest-environment node */
import {generateWorkingDiagramPdf} from '@/lib/generators/workingDiagram'
jest.mock('@/lib/db',()=>({__esModule:true,default:{query:async()=>({rows:[{name:'Fictional rectangle',survey_type:'cadastral'}]})}}))
jest.mock('@/lib/generators/deedPlanGeometry',()=>({loadPreAdjustedFromDB:async()=>null,computeDeedPlanGeometry:async()=>({
 stations:[{station:'A1',easting:500000,northing:9900000},{station:'A2',easting:500000,northing:9900080},
 {station:'A10',easting:500100,northing:9900080},{station:'A3',easting:500100,northing:9900000}],
 bearingSchedule:[{from:'A1',to:'A2',bearing:'000',distance:'80.000'},{from:'A2',to:'A10',bearing:'090',distance:'100.000'},
 {from:'A10',to:'A3',bearing:'180',distance:'80.000'},{from:'A3',to:'A1',bearing:'270',distance:'100.000'}],
 minE:500000,maxE:500100,minN:9900000,maxN:9900080,areaM2:8000,misclosureMm:0,precisionRatio:'1:Infinity',closureStatus:'PASS'
})}))
test('working diagram keeps complete northings on one line',async()=>{
 const pdf=await generateWorkingDiagramPdf('qa')
 expect(pdf.toString('latin1')).toContain('(9900080.000)')
 expect(pdf.toString('latin1')).toContain('(COORDINATE-DERIVED BOUNDARY SCHEDULE)')
 if(process.env.WRITE_QA_PDF==='1') require('fs').writeFileSync('live-test-results/cadastral-generated/working-diagram-layout-check.pdf',pdf)
})
