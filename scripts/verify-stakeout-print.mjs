import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

// Run the actual pure TypeScript report engine without another runtime package.
// These hooks exist only in this verification process, never in the application.
const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')
const root = process.cwd()
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function (module, filename) {
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  module._compile(compiled, filename)
}
const { computeStakeoutReport, generateStakeoutCutSheetHTML } = require('../src/lib/reports/stakeoutCutSheet.ts')
const input = {
  projectName: 'Synthetic drainage inspection — print QA', surveyorName: '',
  reportDate: '2026-10-08', crs: 'EPSG:21037', synthetic: true,
  verticalDatum: 'Synthetic benchmark BM-01', designRevision: 'SYNTHETIC-REV-1',
  tolerance: { horizontalM: 0.01, verticalM: 0.005, reference: 'SYNTHETIC-TEST-SPEC — demonstration only' },
  points: Array.from({ length: 100 }, (_, index) => ({
    pointId: `DR-${String(index + 1).padStart(3, '0')}`,
    design: { easting: 500000 + index * 2, northing: 9860000, elevation: 100 - index * 0.01 },
    staked: { easting: 500000 + index * 2 + (index === 12 ? 0.2 : 0.003), northing: 9860000.004, elevation: index === 3 ? undefined : 100 - index * 0.01 + 0.002 },
    timestamp: '', accuracyM: index === 5 ? 0 : undefined,
    notes: index === 3 ? 'No observed level supplied' : undefined,
  })),
}
const report = computeStakeoutReport(input)
assert.equal(report.summary.unassessedPoints, 2)
assert.equal(report.summary.failedPoints, 1)
assert.equal(report.summary.passedPoints, 97)
assert.equal(report.summary.overallPass, false)
const output = path.resolve('test-results/stakeout-print')
await mkdir(output, { recursive: true })
const htmlPath = path.join(output, 'synthetic-cut-sheet.html')
await writeFile(htmlPath, generateStakeoutCutSheetHTML(report))
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1122, height: 794 } })
  await page.goto('file:///' + htmlPath.replaceAll('\\', '/'), { waitUntil: 'networkidle' })
  await page.emulateMedia({ media: 'print' })
  const content = await page.locator('body').innerText()
  assert.ok(content.includes('SYNTHETIC EXAMPLE'))
  assert.ok(content.includes('NOT ASSESSED'))
  assert.ok(content.includes('DRAFT'))
  assert.ok(content.includes('DR-100'))
  await page.screenshot({ path: path.join(output, 'cut-sheet-print.png'), fullPage: true })
  const pdfPath = path.join(output, 'synthetic-cut-sheet.pdf')
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true })
  const pdf = await PDFDocument.load(await readFile(pdfPath))
  assert.ok(pdf.getPageCount() > 1, 'The long report should paginate')
  for (const sheet of pdf.getPages()) {
    assert.ok(Math.abs(sheet.getWidth() - 841.89) < 2, 'A4 landscape width')
    assert.ok(Math.abs(sheet.getHeight() - 595.28) < 2, 'A4 landscape height')
  }
  const result = { summary: report.summary, pdfPages: pdf.getPageCount(), pageSize: pdf.getPage(0).getSize(), output }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
