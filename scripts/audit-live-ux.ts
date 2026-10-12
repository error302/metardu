import { chromium } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const RESULTS_DIR = path.resolve(process.cwd(), 'live-test-results')

interface AuditIssue {
  page: string
  type: 'error' | 'warning' | 'ux' | 'broken_link' | 'half_baked'
  title: string
  details: string
  selector?: string
}

async function runLiveAudit() {
  const issues: AuditIssue[] = []
  const consoleMessages: { page: string; type: string; text: string }[] = []

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  
  // Create desktop context
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  await desktopContext.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })

  // Create mobile context
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await mobileContext.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })

  const page = await desktopContext.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push({
        page: page.url(),
        type: msg.type(),
        text: msg.text(),
      })
    }
  })

  page.on('pageerror', (err) => {
    issues.push({
      page: page.url(),
      type: 'error',
      title: 'Unhandled Page Exception',
      details: err.message,
    })
  })

  console.log('=== STARTING METARDU LIVE AUDIT ===')

  // 1. LANDING PAGE & FOOTER (DESKTOP)
  console.log('\n--- Auditing Landing Page (Desktop) ---')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Capture full landing page
  await page.screenshot({ path: path.join(RESULTS_DIR, '01_landing_desktop_full.png'), fullPage: true })

  // Focus on Footer
  const footerLocator = page.locator('footer')
  if (await footerLocator.count() > 0) {
    await footerLocator.first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(RESULTS_DIR, '02_footer_desktop.png') })
    console.log('Captured desktop footer screenshot.')

    // Check all footer links
    const footerLinks = await footerLocator.locator('a').evaluateAll((anchors: HTMLAnchorElement[]) =>
      anchors.map((a) => ({ text: a.innerText.trim(), href: a.href, pathname: a.pathname }))
    )
    console.log(`Found ${footerLinks.length} links in footer:`, footerLinks.map(l => `${l.text} -> ${l.href}`))

    for (const link of footerLinks) {
      if (link.href.startsWith('mailto:') || link.href.includes('x.com') || link.href.includes('github.com')) {
        continue
      }
      try {
        const resp = await page.request.get(link.href)
        if (resp.status() >= 400) {
          issues.push({
            page: '/',
            type: 'broken_link',
            title: `Broken footer link: ${link.text}`,
            details: `${link.href} returned HTTP ${resp.status()}`,
          })
          console.log(`❌ Broken link: ${link.text} (${link.href}) -> HTTP ${resp.status()}`)
        } else {
          console.log(`✅ Link OK: ${link.text} (${resp.status()})`)
        }
      } catch (err: any) {
        issues.push({
          page: '/',
          type: 'broken_link',
          title: `Failed to fetch footer link: ${link.text}`,
          details: err.message,
        })
      }
    }
  } else {
    issues.push({
      page: '/',
      type: 'error',
      title: 'Footer not found',
      details: 'No <footer> element located on landing page',
    })
  }

  // 2. FOOTER ON MOBILE
  console.log('\n--- Auditing Landing Page & Footer (Mobile) ---')
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  await mobilePage.waitForTimeout(1000)
  await mobilePage.screenshot({ path: path.join(RESULTS_DIR, '03_landing_mobile_hero.png') })
  const mobileFooter = mobilePage.locator('footer')
  if (await mobileFooter.count() > 0) {
    await mobileFooter.first().scrollIntoViewIfNeeded()
    await mobilePage.waitForTimeout(500)
    await mobilePage.screenshot({ path: path.join(RESULTS_DIR, '04_footer_mobile.png') })
    console.log('Captured mobile footer screenshot.')
  }
  await mobilePage.close()

  // 3. UNATHENTICATED DEMO WORKFLOW (/demo)
  console.log('\n--- Auditing /demo Flow ---')
  await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(RESULTS_DIR, '05_demo_step1.png'), fullPage: true })

  // Check Step 1 UI & interaction
  const step1Btn = page.locator('button:has-text("Run Bowditch Adjustment")').first()
  if (await step1Btn.isVisible()) {
    await step1Btn.click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(RESULTS_DIR, '06_demo_step2_compute.png'), fullPage: true })
    console.log('Step 2 (Compute) rendered successfully.')

    // Check Math Formulae modal
    const mathBtn = page.locator('button:has-text("View Calculation Formulae")').first()
    if (await mathBtn.isVisible()) {
      await mathBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(RESULTS_DIR, '07_demo_math_modal.png') })
      await page.locator('button:has-text("Close")').first().click()
    }

    // Step 3: QA
    const qaBtn = page.locator('button:has-text("Verify QA Checklist")').first()
    if (await qaBtn.isVisible()) {
      await qaBtn.click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(RESULTS_DIR, '08_demo_step3_qa.png'), fullPage: true })
      console.log('Step 3 (QA) rendered successfully.')
    }

    // Step 4: CAD Plan
    const cadBtn = page.locator('button:has-text("Inspect Vector CAD Plan")').first()
    if (await cadBtn.isVisible()) {
      await cadBtn.click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(RESULTS_DIR, '09_demo_step4_cad.png'), fullPage: true })
      console.log('Step 4 (CAD) rendered successfully.')
    }

    // Step 5: Deliverables
    const delivBtn = page.locator('button:has-text("Continue to Deliverables"), button:has-text("Generate Deliverables")').first()
    if (await delivBtn.isVisible()) {
      await delivBtn.click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(RESULTS_DIR, '10_demo_step5_deliverables.png'), fullPage: true })
      console.log('Step 5 (Deliverables) rendered successfully.')
    }
  }

  // 4. AUDITING PRICING (/pricing)
  console.log('\n--- Auditing /pricing Page ---')
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(RESULTS_DIR, '11_pricing_desktop.png'), fullPage: true })

  // Check currency toggles and billing switch
  const billingToggle = page.locator('button[role="switch"], [data-testid="billing-toggle"]')
  if (await billingToggle.count() > 0) {
    await billingToggle.first().click()
    await page.waitForTimeout(500)
    console.log('Toggled billing duration.')
  }

  // 5. AUDITING MARKETPLACE (/marketplace)
  console.log('\n--- Auditing /marketplace Page ---')
  await page.goto(`${BASE_URL}/marketplace`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(RESULTS_DIR, '12_marketplace_desktop.png'), fullPage: true })

  // 6. AUDITING TOOLBOX (/tools)
  console.log('\n--- Auditing /tools Page ---')
  await page.goto(`${BASE_URL}/tools`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(RESULTS_DIR, '13_tools_desktop.png'), fullPage: true })

  // 7. AUDITING STANDALONE MAP (/map)
  console.log('\n--- Auditing /map Page ---')
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '14_map_desktop.png') })

  // Check for any visible error toast or banner
  const errorToasts = await page.locator('[role="alert"], .text-red-500, .bg-red-500').allInnerTexts().catch(() => [])
  if (errorToasts.length > 0) {
    console.log('Alerts on /map:', errorToasts)
  }

  // 8. LOGIN & VERIFY LIVE PROJECT
  console.log('\n--- Auditing Authenticated Flow ---')
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.locator('input[type="email"]').fill('mohameddosho20@gmail.com')
  await page.locator('input[type="password"]').fill('Dosho10701$')
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(2000)

  console.log('Current URL after login:', page.url())
  await page.screenshot({ path: path.join(RESULTS_DIR, '15_after_login.png') })

  // Check project workspace
  const projectId = 'de742cbc-c28c-42e3-8241-cff536ba0473'
  await page.goto(`${BASE_URL}/project/${projectId}`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(RESULTS_DIR, '16_project_overview.png'), fullPage: true })

  // Step 2: Fieldbook
  await page.goto(`${BASE_URL}/project/${projectId}?step=2`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '17_project_step2_fieldbook.png'), fullPage: true })

  // Step 3: Compute
  await page.goto(`${BASE_URL}/project/${projectId}?step=3`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '18_project_step3_compute.png'), fullPage: true })

  // Step 4: Map
  await page.goto(`${BASE_URL}/project/${projectId}?step=4`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '19_project_step4_map.png'), fullPage: true })

  // Step 5: Deliverables
  await page.goto(`${BASE_URL}/project/${projectId}?step=5`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '20_project_step5_deliverables.png'), fullPage: true })

  // CAD Editor
  await page.goto(`${BASE_URL}/project/${projectId}/cad-editor`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(RESULTS_DIR, '21_project_cad_editor.png') })

  console.log('\n=== AUDIT COMPLETE ===')
  console.log(`Identified ${issues.length} structural issues`)
  console.log(`Recorded ${consoleMessages.length} console errors/warnings`)

  // Save audit report JSON
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'audit_report.json'),
    JSON.stringify({ issues, consoleMessages: consoleMessages.slice(0, 30) }, null, 2)
  )

  await browser.close()
}

runLiveAudit().catch((err) => {
  console.error('Audit failed with error:', err)
  process.exit(1)
})
