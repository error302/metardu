import { test, expect, type Page } from '@playwright/test'
import { PLAN_CATALOG } from '../src/lib/subscription/catalog'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1)
}

async function expectCurrentPricing(page: Page) {
  for (const id of ['free', 'pro', 'team']) {
    const plan = PLAN_CATALOG.find(item => item.id === id)
    if (!plan) throw new Error('Missing maintained plan: ' + id)
    const card = page.getByRole('heading', { name: id[0].toUpperCase() + id.slice(1), exact: true }).locator('..')
    await expect(card).toContainText('KSh ' + plan.prices.KES.toLocaleString('en-KE'))
  }
}

test.describe('Responsive Design — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } }) // iPhone X

  test('landing page hero text is readable on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Keep the evidence.\s*Move the work forward./)
    await expectNoHorizontalOverflow(page)
  })

  test('pricing cards visible on mobile', async ({ page }) => {
    await page.goto('/')
    // Scroll to pricing section first
    await page.locator('text=Start free, scale as you grow').scrollIntoViewIfNeeded()
    await expectCurrentPricing(page)
    await expect(page.getByRole('link', { name: 'Start Pro', exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('login page shows mobile branding', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const mobileBrand = page.locator('header a[href="/"]').first()
    await expect(mobileBrand).toBeVisible()
  })

  test('workflow steps remain readable in one column on mobile', async ({ page }) => {
    await page.goto('/')
    const steps = ['Set up the job', 'Bring in observations', 'Review and prepare outputs']
    let previousBottom = 0
    let previousLeft: number | null = null
    for (const name of steps) {
      const heading = page.getByRole('heading', { name, exact: true })
      await expect(heading).toBeVisible()
      const box = await heading.boundingBox()
      if (!box) throw new Error('Workflow heading has no rendered bounds: ' + name)
      expect(box.y).toBeGreaterThanOrEqual(previousBottom)
      if (previousLeft !== null) expect(Math.abs(box.x - previousLeft)).toBeLessThanOrEqual(2)
      previousBottom = box.y + box.height
      previousLeft = box.x
    }
    await expectNoHorizontalOverflow(page)
  })
})

test.describe('Responsive Design — Tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('landing page renders correctly on tablet', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Keep the evidence.\s*Move the work forward./)
    await expectNoHorizontalOverflow(page)
    await expect(page.getByRole('heading', { name: 'Bring in observations', exact: true })).toBeVisible()
  })

  test('login form remains usable on tablet', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

test.describe('Responsive Design — Desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('landing page full layout on desktop', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Keep the evidence.\s*Move the work forward./)
    await expectNoHorizontalOverflow(page)
    await expect(page.getByRole('heading', { name: 'Bring in observations', exact: true })).toBeVisible()
    await expectCurrentPricing(page)
  })
})

test.describe('Accessibility', () => {
  test('all images have alt text', async ({ page }) => {
    await page.goto('/')
    const images = await page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      expect(alt).not.toBeNull()
    }
  })

  test('form inputs have associated labels', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const emailLabel = page.locator('label').filter({ hasText: 'Email' })
    await expect(emailLabel).toBeVisible()
    const passwordLabel = page.locator('label').filter({ hasText: 'Password' })
    await expect(passwordLabel).toBeVisible()
  })

  test('page has lang attribute', async ({ page }) => {
    await page.goto('/')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('en')
  })

  test('skip-to-content link exists for keyboard navigation', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeAttached()
  })
})
