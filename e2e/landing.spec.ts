import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('loads homepage with correct title and meta', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/METARDU/)
  })

  test('renders hero section with key content', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Precision Land')
    await expect(page.locator('h1')).toContainText('Surveying')
  })

  test('has "Built for African Surveyors" badge', async ({ page }) => {
    await page.goto('/')
    const badge = page.locator('text=Built for African Surveyors')
    await expect(badge).toBeVisible()
  })

  test('hero CTA links to register page', async ({ page }) => {
    await page.goto('/')
    const ctaLink = page.locator('a[href="/register"]').first()
    await expect(ctaLink).toBeVisible()
    await ctaLink.click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('trust bar shows African countries', async ({ page }) => {
    await page.goto('/')
    // Use .first() because "Kenya" appears in multiple places on the page
    await expect(page.locator('text=Kenya').first()).toBeVisible()
    await expect(page.locator('text=Nigeria').first()).toBeVisible()
    await expect(page.locator('text=South Africa').first()).toBeVisible()
    // Verify the trust bar section has multiple country entries
    await expect(page.locator('text=Trusted by surveyors across the continent')).toBeVisible()
  })

  test('features bento grid renders 6 feature cards', async ({ page }) => {
    await page.goto('/')
    // Each heading should be unique (h3 elements)
    const headings = page.locator('h3')
    await expect(headings.filter({ hasText: 'Traverse Adjustment' })).toBeVisible()
    await expect(headings.filter({ hasText: 'Deed Plan Generation' })).toBeVisible()
    await expect(headings.filter({ hasText: 'RIM & CLA Forms' })).toBeVisible()
    await expect(headings.filter({ hasText: 'COGO Calculations' })).toBeVisible()
    await expect(headings.filter({ hasText: 'GPS Stakeout' })).toBeVisible()
    await expect(headings.filter({ hasText: 'PDF Reports' })).toBeVisible()
  })

  test('how-it-works section shows 3 steps', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Enter Your Observations')).toBeVisible()
    await expect(page.locator('text=Adjust & Calculate')).toBeVisible()
    await expect(page.locator('text=Export & Submit')).toBeVisible()
  })

  test('professional tools grid shows 8 tools', async ({ page }) => {
    await page.goto('/')
    const tools = [
      'Leveling',
      'Coordinate Transform',
      'Area Calculation',
      'Curve Design',
      'Bearing & Distance',
      'Vertical Curves',
      'Setting Out',
      'Subdivision',
    ]
    for (const tool of tools) {
      await expect(page.locator('h3').filter({ hasText: tool })).toBeVisible()
    }
  })

  test('pricing section shows 3 tiers', async ({ page }) => {
    await page.goto('/')
    // Use h3 for unique heading matches
    await expect(page.locator('h3').filter({ hasText: 'Starter' })).toBeVisible()
    await expect(page.locator('h3').filter({ hasText: 'Professional' })).toBeVisible()
    await expect(page.locator('h3').filter({ hasText: 'Enterprise' })).toBeVisible()
    await expect(page.locator('text=$49')).toBeVisible()
    await expect(page.locator('text=$199')).toBeVisible()
    await expect(page.locator('text=Most Popular')).toBeVisible()
  })

  test('final CTA links to register', async ({ page }) => {
    await page.goto('/')
    const finalCta = page.locator('a[href="/register"]').last()
    await expect(finalCta).toBeVisible()
  })

  test('footer has privacy, terms, and community links', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href="/community"]')).toBeVisible()
    await expect(page.locator('a[href="/docs/privacy"]')).toBeVisible()
    await expect(page.locator('a[href="/docs/terms"]')).toBeVisible()
  })

  test('skip-to-content link exists for accessibility', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeAttached()
  })
})
