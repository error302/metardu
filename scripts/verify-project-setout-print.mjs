import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

const output = path.resolve('test-results/design-revisions')
const html = path.join(output, 'synthetic-project-cut-sheet.html')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1122, height: 794 } })
  await page.goto('file:///' + html.replaceAll('\\', '/'), { waitUntil: 'networkidle' })
  await page.emulateMedia({ media: 'print' })
  const content = await page.locator('body').innerText()
  for (const expected of ['SYNTHETIC VERIFICATION DATA', 'Legacy observations — NOT ASSESSED', 'MH-EXACT (shot 103)', '+0.0054', '100.0054']) assert.ok(content.includes(expected), expected)
  assert.equal(await page.locator('img[alt="METARDU"]').evaluate((logo) => logo.complete && logo.naturalWidth > 0), true)
  await page.screenshot({ path: path.join(output, 'project-cut-sheet-first-page.png') })
  const pdfPath = path.join(output, 'synthetic-project-cut-sheet.pdf')
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true })
  const pdf = await PDFDocument.load(await readFile(pdfPath))
  assert.ok(pdf.getPageCount() > 1)
  for (const sheet of pdf.getPages()) {
    assert.ok(Math.abs(sheet.getWidth() - 841.89) < 2)
    assert.ok(Math.abs(sheet.getHeight() - 595.28) < 2)
  }
  const result = { pdfPages: pdf.getPageCount(), a4Landscape: true, embeddedCanonicalLogoLoaded: true, originalObservedRlShown: '100.0054', lastShotPresentInRenderedHtml: true, output }
  await writeFile(path.join(output, 'print-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally { await browser.close() }
