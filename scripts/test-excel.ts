import * as xlsx from 'xlsx'
import { coordinateArea } from '../src/lib/engine/area'

function testExcel(filePath: string) {
  console.log(`\nTesting ${filePath}...`)
  try {
    const workbook = xlsx.readFile(filePath)
    
    let allCoordinates: { easting: number; northing: number }[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 })
      
      let coordinates: { easting: number; northing: number }[] = []
      
      for (const row of rows) {
        if (!row || !Array.isArray(row)) continue
        const numbers = row.map(cell => Number(cell)).filter(n => !isNaN(n))
        // Assuming coordinates in Kenya/UTM: often > 1000
        const potentialCoords = numbers.filter(n => Math.abs(n) > 1000)
        
        if (potentialCoords.length >= 2) {
          const e = potentialCoords[0]
          const n = potentialCoords[1]
          if (n > e) {
            coordinates.push({ easting: e, northing: n })
          } else {
            coordinates.push({ easting: n, northing: e })
          }
        }
      }
      
      // We take the sheet that has the most coordinates
      if (coordinates.length > allCoordinates.length) {
        allCoordinates = coordinates
      }
    }
    
    if (allCoordinates.length < 3) {
      console.log('Could not find enough coordinates across any sheet.')
      return
    }
    
    console.log(`Extracted ${allCoordinates.length} coordinate pairs (Likely from final traverse or area sheet).`)
    
    // We only need the perimeter coordinates to find the area
    const result = coordinateArea(allCoordinates)
    console.log(`Computed Area: ${result.areaSqm.toFixed(2)} m2`)
    console.log(`Computed Area in Hectares: ${(result.areaSqm / 10000).toFixed(4)} Ha`)
    console.log(`Computed Area in Acres: ${(result.areaSqm / 4046.8564224).toFixed(4)} Acres`)

  } catch (err: any) {
    console.error('Error reading excel:', err.message)
  }
}

testExcel('C:\\Users\\ADMIN\\Downloads\\FINAL THEORETICAL COMPUTATIONS FOR 4 ACRES.xlsx')
testExcel('C:\\Users\\ADMIN\\Downloads\\5 acres compilation NEW.xlsx')
