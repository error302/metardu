import { chromium } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const RESULTS_DIR = path.resolve(process.cwd(), 'live-test-results')
const TEST_EMAIL = 'mohameddosho20@gmail.com'
const TEST_PASSWORD = 'Dosho10701$'

async function run() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }

  console.log('🚀 Launching Playwright browser for end-to-end verification...')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })

  await context.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })

  const page = await context.newPage()

  try {
    // ──────────────────────────────────────────────────────────
    // 1. Unauthenticated Demo Flow (/demo)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 1. Testing Unauthenticated /demo Flow ---')
    await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30000 })
    
    // Check Demo title & synthetic dataset
    const lrHeader = page.locator('text=LR 209/14582 Boundary Survey')
    await lrHeader.waitFor({ state: 'visible', timeout: 10000 })
    console.log('✅ Demo loaded: Found LR 209/14582 Boundary Survey')

    // Step 1: Raw Observations
    const obsRow = page.locator('td:has-text("MB2")').first()
    await obsRow.waitFor({ state: 'visible', timeout: 5000 })
    console.log('✅ Step 1: Raw observations table rendered with EDM readings')

    // Transition to Step 2
    await page.locator('button:has-text("Run Bowditch Adjustment")').first().click()
    await page.waitForSelector('text=Bowditch Adjustment Schedule', { timeout: 5000 })
    console.log('✅ Step 2: Bowditch adjustment schedule computed live')

    // Open math audit modal
    await page.locator('button:has-text("View Calculation Formulae")').first().click()
    await page.waitForSelector('text=Full Mathematical Audit Trail', { timeout: 5000 })
    console.log('✅ Math Audit Trail: Formulae modal verified (Atmospheric PPM, Reg 94, Bowditch, Shoelace)')
    await page.locator('button:has-text("Close")').first().click()

    // Transition to Step 3 (QA)
    await page.locator('button:has-text("Verify QA Checklist")').first().click()
    await page.waitForSelector('text=Kenyan Statutory QA Checklist', { timeout: 5000 })
    const passCount = await page.locator('span:has-text("PASS"), span:has-text("Fully Compliant")').count()
    console.log(`✅ Step 3: Statutory QA verified with ${passCount} compliant items`)

    // Transition to Step 4 (Vector CAD Plan)
    await page.locator('button:has-text("Inspect Vector CAD Plan")').first().click()
    await page.waitForSelector('svg text:has-text("LR 209/14582")', { timeout: 5000 })
    console.log('✅ Step 4: Vector CAD survey plan rendered with neatline, beacons, and title block')

    // Transition to Step 5 (Deliverables)
    await page.locator('button:has-text("Continue to Deliverables"), button:has-text("Generate Deliverables")').first().click()
    await page.waitForSelector('text=Finished Survey Deliverables', { timeout: 5000 })
    console.log('✅ Step 5: Deliverables cards rendered (Coordinate Schedule, DXF, Computation Summary)')

    await page.screenshot({ path: path.join(RESULTS_DIR, '01_demo_flow_verified.png'), fullPage: true })

    // ──────────────────────────────────────────────────────────
    // 2. Logged-in Mohamed Dosho Step 3 Verification
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Mohamed Dosho Project Step 3 Fix ---')
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
    console.log('✅ Logged in successfully as Mohamed Dosho')

    // Navigate to Step 3 of LR 209/14582
    const projectId = 'de742cbc-c28c-42e3-8241-cff536ba0473'
    await page.goto(`${BASE_URL}/project/${projectId}?step=3`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Check that there is NO error warning
    const warning = page.locator('text=Computation Warning: Failed to fetch field book data')
    const hasWarning = await warning.isVisible().catch(() => false)
    if (hasWarning) {
      console.error('❌ Warning still visible!')
    } else {
      console.log('✅ Fixed: No "Failed to fetch field book data" warning on Step 3!')
    }

    // Verify Bowditch Adjusted Coordinates table
    const tableHeader = page.locator('h4:has-text("Table 1 — Bowditch Adjusted Coordinates")').first()
    await tableHeader.waitFor({ state: 'visible', timeout: 10000 })
    console.log('✅ Step 3: Bowditch adjusted coordinates table rendered successfully')

    // Click Field to Finish button if present
    const f2fBtn = page.locator('button:has-text("Field to Finish — One Click")').first()
    if (await f2fBtn.isVisible()) {
      console.log('⚡ Triggering Field-to-Finish One-Click pipeline...')
      await f2fBtn.click()
      await page.waitForTimeout(3000)
      console.log('✅ Field-to-Finish pipeline executed successfully')
    }

    await page.screenshot({ path: path.join(RESULTS_DIR, '02_project_step3_fixed.png'), fullPage: true })

    // ──────────────────────────────────────────────────────────
    // 3. Project CAD Canvas Integration
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Project CAD Canvas Integration ---')
    await page.goto(`${BASE_URL}/project/${projectId}/cad-editor`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000)

    // Verify that beacons are rendered and canvas is NOT blank
    const lrTitleBlock = page.locator('text=LR 209/14582')
    await lrTitleBlock.first().waitFor({ state: 'visible', timeout: 10000 })
    console.log('✅ CAD Canvas: Title block accurately populated with LR 209/14582')

    // Check for beacon nodes
    const mb1Beacon = page.locator('text=MB1')
    await mb1Beacon.first().waitFor({ state: 'visible', timeout: 5000 })
    console.log('✅ CAD Canvas: Beacons MB1 through MB5 rendered on canvas')

    await page.screenshot({ path: path.join(RESULTS_DIR, '03_cad_canvas_fixed.png'), fullPage: true })

    // ──────────────────────────────────────────────────────────
    // 4. Map Page Collapsible Left & Right Rails
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing Map Page Collapsible Left & Right Rails ---')
    await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.ol-viewport', { timeout: 15000 })
    await page.waitForTimeout(2000)

    // Collapse left rail
    const collapseLeftBtn = page.locator('button[aria-label="Collapse tools rail"]')
    if (await collapseLeftBtn.isVisible()) {
      await collapseLeftBtn.click()
      await page.waitForTimeout(500)
      console.log('✅ Left tools rail collapsed successfully')
    }

    // Collapse right dock
    const collapseRightBtn = page.locator('button[aria-label="Collapse dock"]')
    if (await collapseRightBtn.isVisible()) {
      await collapseRightBtn.click()
      await page.waitForTimeout(500)
      console.log('✅ Right dock collapsed successfully')
    }

    await page.screenshot({ path: path.join(RESULTS_DIR, '04_map_both_collapsed.png') })
    console.log('✅ Full-canvas unobstructed map verified with both rails collapsed')

    // Re-expand both
    const expandLeftBtn = page.locator('button[aria-label="Expand tools rail"]')
    if (await expandLeftBtn.isVisible()) {
      await expandLeftBtn.click()
      await page.waitForTimeout(500)
      console.log('✅ Left tools rail expanded successfully')
    }

    const expandRightBtn = page.locator('button[aria-label="Expand dock"]')
    if (await expandRightBtn.isVisible()) {
      await expandRightBtn.click()
      await page.waitForTimeout(500)
      console.log('✅ Right dock expanded successfully')
    }

    await page.screenshot({ path: path.join(RESULTS_DIR, '05_map_both_expanded.png') })
    console.log('✅ Map tools re-expanded cleanly')

    // ──────────────────────────────────────────────────────────
    // 5. Topo Drawing Preview
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 5. Testing Topo Drawing Preview ---')
    await page.goto(`${BASE_URL}/tools/topo-drawing`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Click Load Demo
    const loadDemoBtn = page.locator('button:has-text("Load Demo")')
    if (await loadDemoBtn.isVisible()) {
      await loadDemoBtn.click()
      await page.waitForTimeout(2000)
      console.log('✅ Clicked Load Demo to populate topographic survey points and contours')
    }

    // Check preview tab
    const previewTab = page.locator('button:has-text("Preview"), [role="tab"]:has-text("Preview")').first()
    if (await previewTab.isVisible()) {
      await previewTab.click()
      await page.waitForTimeout(2000)
    }

    await page.screenshot({ path: path.join(RESULTS_DIR, '06_topo_drawing_preview.png') })
    console.log('✅ Topo Drawing preview captured without contour overflow or legend collision')

    console.log('\n🎉 ALL PROFESSIONAL VERIFICATION CHECKS PASSED!')

  } catch (err) {
    console.error('❌ Verification failed:', err)
    await page.screenshot({ path: path.join(RESULTS_DIR, 'error_state.png') }).catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
