import { chromium } from 'playwright'

async function debugProject() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })
  const page = await context.newPage()

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()))
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText))
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      console.log('API RESPONSE:', res.status(), res.url())
    }
  })

  // 1. Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill('mohameddosho20@gmail.com')
  await page.locator('input[type="password"]').fill('Dosho10701$')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'))

  console.log('--- NAVIGATING TO PROJECT WORKSPACE STEP 3 ---')
  await page.goto('http://localhost:3000/project/de742cbc-c28c-42e3-8241-cff536ba0473?step=3', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  console.log('--- NAVIGATING TO CAD EDITOR ---')
  await page.goto('http://localhost:3000/project/de742cbc-c28c-42e3-8241-cff536ba0473/cad-editor', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  const cadState = await page.evaluate(async () => {
    const res = await fetch('/api/project/de742cbc-c28c-42e3-8241-cff536ba0473')
    const json = await res.json()
    const pointsRes = await fetch('/api/project/de742cbc-c28c-42e3-8241-cff536ba0473/points')
    const pointsJson = await pointsRes.json().catch(() => null)
    return {
      project: json,
      points: pointsJson,
      titleText: document.querySelector('.font-semibold')?.textContent,
      canvasExists: !!document.querySelector('svg, canvas'),
      beaconElements: document.querySelectorAll('[data-beacon-id], circle').length,
    }
  })
  console.log('CAD STATE EVALUATED:', JSON.stringify(cadState, null, 2))

  await browser.close()
}

debugProject().catch(console.error)
