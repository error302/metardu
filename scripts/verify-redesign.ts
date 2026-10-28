import { chromium } from 'playwright';
import * as path from 'path'
import 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const RESULTS_DIR = path.resolve(process.cwd(), 'live-test-results')

async function run() {
  console.log('Testing live deployed container on http://localhost:3000...')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })

  // Desktop
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })

  const page = await context.newPage()

  // Track CSP errors on pricing
  const cspErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
      cspErrors.push(msg.text())
    }
  })

  // 1. Landing & Footer
  console.log('Navigating to landing page...')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  const footer = page.locator('footer')
  await footer.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '02_footer_redesigned_desktop.png') })
  console.log('Captured 02_footer_redesigned_desktop.png')

  // 2. Mobile Footer
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  const mobileFooter = mobilePage.locator('footer')
  await mobileFooter.scrollIntoViewIfNeeded()
  await mobilePage.waitForTimeout(1000)
  await mobilePage.screenshot({ path: path.join(RESULTS_DIR, '04_footer_redesigned_mobile.png') })
  console.log('Captured 04_footer_redesigned_mobile.png')
  await mobilePage.close()

  // 3. Test Pricing Page PayPal Tab
  console.log('Navigating to /pricing to test PayPal CSP...')
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Click PayPal Tab
  const paypalTab = page.locator('button:has-text("PayPal / International Card"), button:has-text("PayPal")').first()
  if (await paypalTab.isVisible()) {
    console.log('Clicking PayPal tab...')
    await paypalTab.click()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(RESULTS_DIR, '11_pricing_paypal_tab.png') })
    console.log('Captured 11_pricing_paypal_tab.png')
  }

  if (cspErrors.length > 0) {
    console.log('CSP Errors found:', cspErrors)
  } else {
    console.log('SUCCESS: No PayPal CSP errors encountered!')
  }

  await browser.close()
  console.log('Verification finished successfully!')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
