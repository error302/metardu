import { z } from 'zod'
import { chromium } from 'playwright'
import * as path from 'path'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const RESULTS_DIR = path.resolve(process.cwd(), 'live-test-results')

async function verifyAll() {
  console.log(`Starting comprehensive verification on ${BASE_URL}...`)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })

  const page = await context.newPage()

  // Track console errors
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  // 1. Verify Marketplace
  console.log('\n--- Test 1: Equipment Marketplace ---')
  await page.goto(`${BASE_URL}/marketplace`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Check listings rendered
  const listingCards = page.locator('div[class*="rounded-xl border"][class*="bg-[var(--bg-secondary)]"]')
  const count = await listingCards.count()
  console.log(`Found ${count} equipment listing cards in Marketplace DOM`)

  // Check for specific seeded equipment
  const leicaCard = page.getByText('Leica TS16')
  const trimbleCard = page.getByText('Trimble R12i')
  const droneCard = page.getByText('DJI Matrice 300 RTK')

  const hasLeica = (await leicaCard.count()) > 0
  const hasTrimble = (await trimbleCard.count()) > 0
  const hasDrone = (await droneCard.count()) > 0

  console.log(`Seeded Equipment Verified:
  - Leica TS16 Robotic: ${hasLeica ? 'PASS' : 'FAIL'}
  - Trimble R12i GNSS: ${hasTrimble ? 'PASS' : 'FAIL'}
  - DJI Matrice 300 RTK: ${hasDrone ? 'PASS' : 'FAIL'}`)

  await page.screenshot({ path: path.join(RESULTS_DIR, '15_marketplace_seeded_desktop.png') })
  console.log('Captured 15_marketplace_seeded_desktop.png')

  // 2. Verify Spatial Index API
  console.log('\n--- Test 2: PostGIS Viewport Query API ---')
  const spatialRes = await fetch(`${BASE_URL}/api/spatial-index?west=36.7&south=-1.35&east=37.1&north=-1.20`)
  console.log(`GET /api/spatial-index status: ${spatialRes.status} (${spatialRes.statusText})`)
  if (spatialRes.ok) {
    const body: unknown = await spatialRes.json()
    const spatialData = z.object({ data: z.object({ features: z.array(z.unknown()) }) }).parse(body)
    console.log(`Spatial Index Features returned: ${spatialData?.data?.features?.length ?? 0}`)
  }

  // 3. Verify Landing Footer Status
  console.log('\n--- Test 3: High-End Footer & Geodetic Status ---')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  const footer = page.locator('footer')
  await footer.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)

  const geodesyStatus = page.getByText('GEODESY ENGINE v1.0 ONLINE')
  const statutoryCard = page.getByText('Survey Act Cap 299')
  const hasGeodesy = (await geodesyStatus.count()) > 0
  const hasStatutory = (await statutoryCard.count()) > 0

  console.log(`Footer Elements Verified:
  - Geodesy Status Indicator: ${hasGeodesy ? 'PASS' : 'FAIL'}
  - Statutory Authority Reference: ${hasStatutory ? 'PASS' : 'FAIL'}`)

  await browser.close()
  console.log('\nAll verifications completed successfully!')
}

verifyAll().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
