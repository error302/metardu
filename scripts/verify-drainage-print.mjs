import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'

// Document rendering only: no website, credentials, or customer-data access.
export async function printDrainageCutSheet(directory = 'test-results/drainage-http') {
  const output = path.resolve(directory)
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1122, height: 794 } })
    await page.goto(pathToFileURL(path.join(output, 'synthetic-drainage-cut-sheet.html')).href, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    const text = await page.locator('body').innerText()
    for (const expected of ['SYNTHETIC HTTP VERIFICATION', 'NOT ASSESSED', 'FAIL', '100.0054', 'Synthetic benchmark BM-01']) {
      assert.ok(text.includes(expected), `Rendered cut sheet must retain ${expected}`)
    }
    assert.equal(await page.locator('img[alt="METARDU"]').evaluate(logo => logo.complete && logo.naturalWidth > 0), true)
    await page.screenshot({ path: path.join(output, 'synthetic-drainage-cut-sheet.png'), fullPage: true })
    const file = path.join(output, 'synthetic-drainage-cut-sheet.pdf')
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true })
    const bytes = await readFile(file), pdf = await PDFDocument.load(bytes)
    assert.ok(pdf.getPageCount() >= 1)
    for (const sheet of pdf.getPages()) {
      assert.ok(Math.abs(sheet.getWidth() - 841.89) < 2 && Math.abs(sheet.getHeight() - 595.28) < 2, 'Every PDF page must be A4 landscape')
    }
    const result = { synthetic: true, pdfPages: pdf.getPageCount(), a4Landscape: true,
      embeddedCanonicalLogoLoaded: true, renderedOriginalRl: '100.0054', renderedFailedAndUnassessedShots: true }
    await writeFile(path.join(output, 'print-result.json'), JSON.stringify(result, null, 2) + '\n')
    return { bytes, result }
  } finally { await browser.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify((await printDrainageCutSheet()).result))
}
