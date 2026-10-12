import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const base = process.env.METARDU_QA_ORIGIN || 'http://127.0.0.1:3100'
const output = path.resolve('test-results/stakeout-report')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
})
const checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto(`${base}/tools/stakeout-report`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 })
  } catch {
    // Next dev telemetry/HMR can keep connections active. Confirm hydration
    // using the actual interactive control before testing user actions.
    await page.getByLabel('Example data selection').waitFor({ timeout: 15000 })
  }
  assert.equal(response?.status(), 200)
  const print = page.getByRole('button', { name: 'Print Cut Sheet' })
  assert.equal(await print.isDisabled(), true)
  await page.screenshot({ path: path.join(output, 'desktop-empty.png'), fullPage: true })
  checks.push('Initial form has no exportable invented observations')

  await page.getByLabel('Example data selection').selectOption('column_grid')
  await page.getByRole('status').filter({ hasText: 'Synthetic example' }).waitFor()
  assert.equal(await print.isDisabled(), false)
  await page.screenshot({ path: path.join(output, 'desktop-synthetic.png'), fullPage: true })

  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download HTML Report' }).click()
  const download = await downloadEvent
  const cutSheet = path.join(output, 'synthetic-cut-sheet.html')
  await download.saveAs(cutSheet)
  checks.push('Synthetic report downloads from the actual form')

  await page.getByLabel('COL-A1 staked.easting', { exact: true }).fill('')
  assert.equal(await page.getByLabel('COL-A1 staked.easting', { exact: true }).inputValue(), '')
  assert.equal(await print.isDisabled(), true)
  checks.push('Cleared measured coordinate remains blank and disables stale exports')

  await page.getByLabel('Example data selection').selectOption('')
  await page.getByLabel('Example data selection').selectOption('column_grid')
  await page.getByLabel('COL-A1 staked.elevation', { exact: true }).fill('')
  await page.getByText('NOT ASSESSED', { exact: true }).waitFor()
  checks.push('Missing observed RL is visibly unassessed')

  await page.getByLabel('Example data selection').selectOption('')
  await page.getByLabel('Example data selection').selectOption('column_grid')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'mobile-synthetic.png'), fullPage: true })
  const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }))
  assert.ok(width.document <= width.viewport + 2, `Mobile document overflow: ${JSON.stringify(width)}`)
  checks.push('Mobile page contains the scrolling table without document overflow')

  const sheet = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  await sheet.goto('file:///' + cutSheet.replaceAll('\\', '/'), { waitUntil: 'networkidle' })
  assert.ok((await sheet.locator('body').innerText()).includes('SYNTHETIC EXAMPLE'))
  assert.ok((await sheet.locator('body').innerText()).includes('DRAFT'))
  await sheet.emulateMedia({ media: 'print' })
  await sheet.screenshot({ path: path.join(output, 'cut-sheet-print.png'), fullPage: true })
  await sheet.pdf({ path: path.join(output, 'synthetic-cut-sheet.pdf'), preferCSSPageSize: true, printBackground: true })
  assert.deepEqual(errors, [])
  checks.push('Print preview and PDF preserve synthetic/draft status; no page JavaScript errors')
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, width, errors, origin: base }, null, 2))
  console.log(JSON.stringify({ checks, output }, null, 2))
} finally {
  await browser.close()
}
