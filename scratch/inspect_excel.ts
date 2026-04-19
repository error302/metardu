import * as xlsx from 'xlsx'

function inspectExcel(filePath: string) {
  try {
    const workbook = xlsx.readFile(filePath)
    console.log('Sheet Names:', workbook.SheetNames)
    
    for (const name of workbook.SheetNames) {
      console.log(`\n--- Sheet: ${name} ---`)
      const sheet = workbook.Sheets[name]
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 })
      rows.slice(0, 10).forEach((row, i) => {
        console.log(`Row ${i}:`, row)
      })
    }
  } catch (err: any) {
    console.error('Error:', err.message)
  }
}

inspectExcel('C:\\Users\\ADMIN\\Downloads\\FINAL THEORETICAL COMPUTATIONS FOR 4 ACRES.xlsx')
