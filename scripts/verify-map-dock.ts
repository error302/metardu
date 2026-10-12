import { chromium } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const RESULTS_DIR = path.join(__dirname, '../live-test-results')
const TEST_EMAIL = 'mohameddosho20@gmail.com'
const TEST_PASSWORD = 'Dosho10701$'

async function run() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }

  console.log('🚀 Launching browser for Map Dock verification...')
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
    // 1. Login
    console.log(`🔑 Logging in as ${TEST_EMAIL}...`)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 })

    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
    console.log('✅ Logged in successfully!')

    // 2. Navigate to /map
    console.log('🗺️ Navigating to /map...')
    await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.ol-viewport', { timeout: 15000 })
    await page.waitForTimeout(2000) // Allow map canvas and overlays to settle

    // 3. Verify Dock region exists
    const dock = page.locator('[aria-label="Map tools dock"]')
    await dock.waitFor({ state: 'visible', timeout: 5000 })
    console.log('✅ Found Map tools dock region.')

    // 4. Verify controls in expanded dock
    const zoomIn = page.locator('[aria-label="Zoom in"]')
    const zoomOut = page.locator('[aria-label="Zoom out"]')
    const projBtn = page.locator('button[aria-label^="Projection:"]')
    const northBtn = page.locator('button[aria-label*="North"]')
    const printBtn = page.locator('button[title="Print document"]')
    const stakeoutOnRight = dock.locator('[aria-label="Stakeout radar"]')

    console.log('🔍 Checking controls in dock:')
    console.log(`  - Zoom in button: ${await zoomIn.count() > 0 ? 'PRESENT' : 'MISSING'}`)
    console.log(`  - Zoom out button: ${await zoomOut.count() > 0 ? 'PRESENT' : 'MISSING'}`)
    console.log(`  - Projection Switcher: ${await projBtn.count() > 0 ? 'PRESENT' : 'MISSING'}`)
    console.log(`  - North Arrow / Compass: ${await northBtn.count() > 0 ? 'PRESENT' : 'MISSING'}`)
    console.log(`  - Print button: ${await printBtn.count() > 0 ? 'PRESENT' : 'MISSING'}`)
    console.log(`  - Stakeout on right dock (should be removed): ${await stakeoutOnRight.count() === 0 ? 'REMOVED (CORRECT)' : 'STILL PRESENT (ERROR)'}`)

    // Check number of North arrows on map (should be exactly 1)
    const allNorthArrows = await page.locator('button[aria-label*="North"]').count()
    console.log(`  - Total compass / north arrows on map: ${allNorthArrows} (Expected: 1)`)

    // Verify Projection Switcher does not overlap zoom controls
    const zoomBox = await page.locator('[role="group"][aria-label="Map zoom controls"]').boundingBox()
    const projBox = await projBtn.boundingBox()
    if (zoomBox && projBox) {
      console.log(`  - Zoom Box: y=${zoomBox.y}, height=${zoomBox.height}, bottom=${zoomBox.y + zoomBox.height}`)
      console.log(`  - Proj Box: y=${projBox.y}, height=${projBox.height}`)
      const isOverlapping = !(projBox.y >= (zoomBox.y + zoomBox.height) || (projBox.y + projBox.height) <= zoomBox.y)
      console.log(`  - Overlap detected: ${isOverlapping ? 'YES (COLLISION!)' : 'NO (CLEAN VERTICAL STACK)'}`)
    }

    // Capture Expanded Screenshot
    const expandedScreenshot = path.join(RESULTS_DIR, 'map_dock_expanded.png')
    await page.screenshot({ path: expandedScreenshot, fullPage: false })
    console.log(`📸 Saved expanded dock screenshot: ${expandedScreenshot}`)

    // 5. Test Projection Switcher Dropdown
    console.log('🌐 Testing Projection Switcher dropdown...')
    await projBtn.click()
    await page.waitForTimeout(500)
    const dropdownScreenshot = path.join(RESULTS_DIR, 'map_dock_projection_open.png')
    await page.screenshot({ path: dropdownScreenshot, fullPage: false })
    console.log(`📸 Saved projection dropdown screenshot: ${dropdownScreenshot}`)
    // Close dropdown
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // 6. Test Dock Collapse
    console.log('📐 Testing Dock Collapse for clean map view...')
    const collapseBtn = page.locator('button[title*="Collapse map tools"]')
    await collapseBtn.click()
    await page.waitForTimeout(500)

    const isZoomVisibleAfterCollapse = await zoomIn.isVisible().catch(() => false)
    console.log(`  - Zoom controls hidden after collapse: ${!isZoomVisibleAfterCollapse ? 'YES' : 'NO'}`)

    const collapsedScreenshot = path.join(RESULTS_DIR, 'map_dock_collapsed.png')
    await page.screenshot({ path: collapsedScreenshot, fullPage: false })
    console.log(`📸 Saved collapsed clean map screenshot: ${collapsedScreenshot}`)

    // 7. Test Dock Expand
    console.log('📐 Testing Dock Re-expand...')
    const expandBtn = page.locator('button[title*="Expand map tools"]')
    await expandBtn.click()
    await page.waitForTimeout(500)

    const isZoomVisibleAfterExpand = await zoomIn.isVisible().catch(() => false)
    console.log(`  - Zoom controls restored after expand: ${isZoomVisibleAfterExpand ? 'YES' : 'NO'}`)

    console.log('🎉 ALL CHECKS COMPLETED SUCCESSFULLY!')
  } catch (err) {
    console.error('❌ Test failed:', err)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

run()
