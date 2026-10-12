import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { generateDocumentSafe } from '../src/lib/documents/templates/registry'

async function main() {
  const directory = 'test-results/setting-out-pagination'
  const label = process.argv.includes('--baseline') ? 'before-pagination-repair' : 'synthetic-setting-out-sheet'
  const data = { projectName: 'SYNTHETIC setting-out pagination - NOT FIELD EVIDENCE',
    surveyorName: '', surveyorLicense: '', date: '2026-10-11', projection: 'EPSG:21037', datum: 'Arc 1960; heights not supplied',
    points: Array.from({ length: 50 }, (_, i) => ({ pointId: `SYN-${String(i + 1).padStart(3, '0')}`,
      designE: 500000 + i * 0.125, designN: 9800000 + i * 0.25,
      bearing: '90°00\'00"', distance: '12.345', offsetE: i === 0 ? 0 : undefined, offsetN: i === 0 ? 0 : undefined,
      toleranceCheck: 'NOT ASSESSED', remarks: 'Synthetic design input; control not verified' })) }
  // Exercise the same lazy registry dispatch used by document callers rather
  // than invoking the template module directly.
  const bytes = await generateDocumentSafe('setting-out', data, { plan: 'pro' })
  const pdf = await PDFDocument.load(bytes)
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/${label}.pdf`, bytes)
  await writeFile(`${directory}/${label}.json`, JSON.stringify({ synthetic: true, suppliedPoints: data.points.length,
    pdfPages: pdf.getPageCount(), caller: 'generateDocumentSafe(setting-out)', sourceOnly: true, productionMutated: false, physicalFieldProof: false }, null, 2) + '\n')
  console.log(JSON.stringify({ suppliedPoints: 50, pdfPages: pdf.getPageCount(), synthetic: true }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
