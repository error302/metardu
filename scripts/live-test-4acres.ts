import * as xlsx from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { SurveyPlanRenderer } from '../src/lib/reports/surveyPlan/renderer'
import { SurveyPlanData } from '../src/lib/reports/surveyPlan/types'
import { SurveyPlanDataSchema } from '../src/lib/validation/surveySchema'
import { coordinateArea } from '../src/lib/engine/area'

async function generateLiveTest() {
  const EXCEL_PATH = 'C:\\Users\\ADMIN\\Downloads\\FINAL THEORETICAL COMPUTATIONS FOR 4 ACRES.xlsx'
  const OUTPUT_DIR = path.join(process.cwd(), 'verification')
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR)

  console.log(`\n--- LIVE TEST: 4-ACRE PLAN GENERATION ---`)
  console.log(`Source: ${EXCEL_PATH}`)

  try {
    const workbook = xlsx.readFile(EXCEL_PATH)
    const sheet = workbook.Sheets['FINAL COORDINATE LIST']
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 })
    
    // Extract points: Filter for Parcel A boundary (AB series)
    let points: { name: string; easting: number; northing: number }[] = []
    rows.forEach((row: any) => {
      const name = String(row[1] || '')
      const northing = Number(row[2])
      const easting = Math.abs(Number(row[3])) // Normalize sign for local grid consistency
      
      if (!isNaN(northing) && !isNaN(easting) && name.startsWith('AB')) {
        points.push({ name, easting, northing })
      }
    })

    // Reorder points to form a sensible polygon (AB1 -> AB2 -> AB3 -> AB4 -> AB1)
    // Based on the data, the order in the spreadsheet is the correct clockwise/anti-clockwise order
    points = points.filter((p, i, self) => self.findIndex(t => t.name === p.name) === i)

    if (points.length < 3) {
      throw new Error('Insufficient points found in Excel.')
    }

    console.log(`Extracted ${points.length} boundary points.`)

    // Compute area to double check
    const areaResult = coordinateArea(points)
    const areaSqm = areaResult.areaSqm
    const areaHa = areaSqm / 10000
    console.log(`Detected Area: ${areaSqm.toFixed(2)} m2 (${areaHa.toFixed(4)} Ha)`)

    // Prepare SurveyPlanData
    const data: SurveyPlanData = {
      project: {
        name: 'PROPOSED SUBDIVISION OF 4 ACRES',
        location: 'ELDORET TOWN',
        utm_zone: 36, // Dominant UTM zone for Eldoret region
        hemisphere: 'N',
        datum: 'WGS84', // Using standard datum for CAD engine compatibility
        client_name: 'ESTATE OF LATE PHILIP KIPROTICH',
        surveyor_name: 'MOHAMED DOSHO',
        surveyor_licence: 'LSK/2026/04',
        firm_name: 'METARDU GEOSPATIAL',
        firm_address: 'P.O. BOX 10701-30100 ELDORET',
        plan_title: 'SUBDIVISION PLAN - ELDORET MUNICIPALITY',
        area_sqm: areaSqm,
        area_ha: areaHa,
        parcel_id: 'UASIN GISHU / ELDORET MUNICIPALITY / BLOCK 10 / 456',
        drawing_no: 'LS/ Eldoret / 2026 / 04',
        iskRegNo: 'ISK/3452/2026',
        hundred: 'ELDORET',
      },
      parcel: {
        boundaryPoints: points,
        area_sqm: areaSqm,
        perimeter_m: areaResult.perimeter || 0,
      },
      controlPoints: [
        { name: 'RD21', easting: 114370.35, northing: -4182.37, monumentType: 'found', beaconDescription: 'OLD IRON PIN IN CONC' }
      ],
    }

    // Quality Hardening: Validate with Zod
    console.log('Validating data with Zod...')
    const validation = SurveyPlanDataSchema.safeParse(data)
    if (!validation.success) {
      console.error('Validation Error:', JSON.stringify(validation.error.errors, null, 2))
      process.exit(1)
    }
    console.log('✅ Data validation passed.')

    // Render SVG
    console.log('Rendering Survey Plan to SVG...')
    const renderer = new SurveyPlanRenderer(data, {
      paperSize: 'a3',
      includeGrid: true,
      includePanel: true
    })
    
    const svg = renderer.render()
    const outputPath = path.join(OUTPUT_DIR, '4-acre-plan.svg')
    fs.writeFileSync(outputPath, svg)
    
    console.log(`✅ Success! Plan generated at: ${outputPath}`)
    console.log(`--- TEST COMPLETE ---`)

  } catch (err: any) {
    console.error('FAILED:', err.message)
    process.exit(1)
  }
}

generateLiveTest()
