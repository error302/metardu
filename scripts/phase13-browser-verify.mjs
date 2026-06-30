import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const baseUrl = process.env.METARDU_BASE_URL || 'http://127.0.0.1:3000'
const outDir = new URL('../live-test-results/phase13/', import.meta.url)
await mkdir(outDir, { recursive: true })
const outPath = name => fileURLToPath(new URL(name, outDir))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const results = []

async function check(path, expected) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('body').waitFor({ timeout: 30000 })
  const body = await page.textContent('body')
  const title = await page.locator('h1').first().textContent().catch(() => '')
  const selectors = expected.map(text => [text, body.includes(text)])
  results.push({ path, title, ok: selectors.every(([, ok]) => ok), selectors })
}

await check('/tools', ['Mobilisation Report', 'Control Marks Register', 'Detail Tolerances'])
await page.screenshot({ path: outPath('tools.png'), fullPage: true })

await check('/tools/detail-tolerances', ['Detailed Survey Tolerances', 'Structures, buildings, paved roads', 'RDM 1.1 Table 5.2'])
await page.waitForTimeout(2000)
const printPopupPromise = browser.contexts()[0].waitForEvent('page')
await page.getByRole('button', { name: 'Print Schedule' }).click()
const printPopup = await printPopupPromise
await printPopup.waitForLoadState('domcontentloaded')
const printBody = await printPopup.textContent('body')
results.push({
  path: '/tools/detail-tolerances print',
  title: 'print popup',
  ok: printBody.includes('METARDU') && printBody.includes('Surveyor') && printBody.includes('Detailed Survey Tolerances'),
  selectors: [
    ['METARDU', printBody.includes('METARDU')],
    ['Surveyor', printBody.includes('Surveyor')],
    ['Detailed Survey Tolerances', printBody.includes('Detailed Survey Tolerances')],
  ],
})
await printPopup.close()
await page.screenshot({ path: outPath('detail-tolerances.png'), fullPage: true })

await check('/tools/mobilisation-report', ['Mobilisation Report', 'Report Header', 'Load Road Survey Demo'])
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Load Road Survey Demo' }).click()
await page.waitForTimeout(300)
let formValues = await page.locator('input, textarea').evaluateAll(nodes => nodes.map(node => node.value).join('\n'))
results.push({
  path: '/tools/mobilisation-report demo',
  title: 'demo loaded',
  ok: formValues.includes('Kangundo Road junction improvement') && formValues.includes('Eng. Amina W. Njoroge') && formValues.includes('CAL/TS/2026/041'),
  selectors: [
    ['Kangundo Road junction improvement', formValues.includes('Kangundo Road junction improvement')],
    ['Eng. Amina W. Njoroge', formValues.includes('Eng. Amina W. Njoroge')],
    ['CAL/TS/2026/041', formValues.includes('CAL/TS/2026/041')],
  ],
})
await page.screenshot({ path: outPath('mobilisation-report-demo.png'), fullPage: true })

await check('/tools/control-marks-register', ['Survey Control Marks Register', 'Register Header', 'Add Mark'])
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Load Engineering Control Demo' }).click()
await page.waitForTimeout(300)
formValues = await page.locator('input, textarea').evaluateAll(nodes => nodes.map(node => node.value).join('\n'))
results.push({
  path: '/tools/control-marks-register demo',
  title: 'demo loaded',
  ok: formValues.includes('CP01') && formValues.includes('BM03') && formValues.includes('1538.426'),
  selectors: [
    ['CP01', formValues.includes('CP01')],
    ['BM03', formValues.includes('BM03')],
    ['1538.426', formValues.includes('1538.426')],
  ],
})
await page.screenshot({ path: outPath('control-marks-register-demo.png'), fullPage: true })

await check('/tools/cross-sections', ['RDM 1.1 Table 5.2 Detail Pickup Tolerances', 'Gravel pavements'])
await page.screenshot({ path: outPath('cross-sections-tolerances.png'), fullPage: true })

await browser.close()

console.log(JSON.stringify(results, null, 2))
if (results.some(result => !result.ok)) process.exit(1)
