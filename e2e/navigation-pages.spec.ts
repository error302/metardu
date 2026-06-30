import { test, expect } from '@playwright/test'

test.describe('Register Page', () => {
  test('loads register page', async ({ page }) => {
    const response = await page.goto('/register')
    expect(response?.status()).not.toBe(404)
  })
})

test.describe('Navigation', () => {
  test('navbar exists on landing page', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav')
    await expect(nav.first()).toBeAttached()
  })

  test('can navigate to tools page', async ({ page }) => {
    const response = await page.goto('/tools')
    expect(response?.status()).not.toBe(404)
  })

  test('can navigate to docs page', async ({ page }) => {
    const response = await page.goto('/docs')
    expect(response?.status()).not.toBe(404)
  })

  test('can navigate to community page', async ({ page }) => {
    const response = await page.goto('/community')
    expect(response?.status()).not.toBe(404)
  })

  test('can navigate to pricing page', async ({ page }) => {
    const response = await page.goto('/pricing')
    expect(response?.status()).not.toBe(404)
  })
})

test.describe('Survey Tools Pages', () => {
  const toolPages = [
    { path: '/tools/traverse', name: 'Traverse' },
    { path: '/tools/leveling', name: 'Leveling' },
    { path: '/tools/cogo', name: 'COGO' },
    { path: '/tools/bearing', name: 'Bearing' },
    { path: '/tools/distance', name: 'Distance' },
    { path: '/tools/area', name: 'Area' },
    { path: '/tools/curves', name: 'Curves' },
    { path: '/tools/coordinates', name: 'Coordinates' },
    { path: '/tools/level-book', name: 'Level Book' },
    { path: '/tools/traverse-field-book', name: 'Traverse Field Book' },
    { path: '/tools/cross-sections', name: 'Cross Sections' },
    { path: '/tools/superelevation', name: 'Superelevation' },
    { path: '/tools/gnss', name: 'GNSS' },
    { path: '/tools/setting-out', name: 'Setting Out' },
    { path: '/tools/road-design', name: 'Road Design' },
  ]

  for (const { path: pg, name } of toolPages) {
    test(`${name} page loads without 404`, async ({ page }) => {
      const response = await page.goto(pg, { waitUntil: 'commit' })
      expect(response?.status()).not.toBe(404)
    })
  }
})

test.describe('Static Pages', () => {
  const staticPages = [
    '/guide',
    '/docs/privacy',
    '/docs/terms',
    '/docs/faq',
    '/docs/manuals',
    '/docs/survey-act',
    '/docs/first-plan',
    '/docs/rdm-accuracy',
    '/docs/csv-import',
    '/docs/quick-start',
    '/docs/level-book',
    '/docs/traverse-field-book',
    '/land-law',
    '/parsers',
    '/instruments',
    '/equipment',
    '/notifications',
    '/audit-logs',
    '/beacons',
    '/ai-plan-checker',
  ]

  for (const pg of staticPages) {
    test(`${pg} loads without 404`, async ({ page }) => {
      const response = await page.goto(pg, { waitUntil: 'commit' })
      expect(response?.status()).not.toBe(404)
    })
  }
})

test.describe('404 Page', () => {
  test('non-existent page shows 404', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-xyz')
    expect(response?.status()).toBe(404)
  })
})

test.describe('HTML Head & SEO', () => {
  test('homepage has viewport meta', async ({ page }) => {
    await page.goto('/')
    const viewport = page.locator('meta[name="viewport"]')
    await expect(viewport).toHaveAttribute('content', /width=device-width/)
  })

  test('homepage has description meta', async ({ page }) => {
    await page.goto('/')
    const description = page.locator('meta[name="description"]')
    await expect(description).toHaveAttribute('content', /surveying/i)
  })

  test('homepage has theme-color meta', async ({ page }) => {
    await page.goto('/')
    const themeColor = page.locator('meta[name="theme-color"]')
    await expect(themeColor).toBeAttached()
  })

  test('has PWA manifest link', async ({ page }) => {
    await page.goto('/')
    const manifest = page.locator('link[rel="manifest"]')
    await expect(manifest).toBeAttached()
  })

  test('has apple-mobile-web-app-capable meta', async ({ page }) => {
    await page.goto('/')
    const pwaMeta = page.locator('meta[name="apple-mobile-web-app-capable"]')
    await expect(pwaMeta).toHaveAttribute('content', 'yes')
  })
})
