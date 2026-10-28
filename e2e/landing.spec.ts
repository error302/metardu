import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {
  test('keeps the public navigation focused on visitor decisions', async ({ page }) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    const menu = nav.getByRole('button', { name: 'Open menu', exact: true })
    if (await menu.isVisible()) {
      await menu.click()
      await expect(nav.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true')
    }
    await expect(nav.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#workflow')
    await expect(nav.getByRole('link', { name: 'Product demo' })).toHaveAttribute('href', '/demo')
    await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing')
    await expect(nav.getByRole('link', { name: 'Open dashboard', exact: true })).toHaveAttribute('href', '/dashboard')
    await expect(nav.getByRole('link', { name: 'Survey Map' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Search' })).toHaveCount(0)
  })

  test('explains the survey workflow and gives visitors clear next steps', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/METARDU/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Keep the evidence\.\s*Move the work forward\./)
    await expect(page.getByText(/Keep field evidence, computations, maps, and draft outputs together/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Try the interactive sample' })).toHaveAttribute('href', '/demo')
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
    await expect(page.locator('main a[href="/dashboard"]')).toHaveCount(0)
    await expect(page.locator('main').getByRole('link', { name: 'Install the app' })).toHaveAttribute('href', '/install')
  })

  test('shows real reference photography with visible source and license credits', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('img', { name: /total station set up beneath a bridge/i })).toBeVisible()
    await expect(page.getByRole('img', { name: /digital level on a tripod/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'FedericaGaspari' })).toHaveAttribute('href', /commons\.wikimedia\.org/)
    await expect(page.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/')
    await expect(page.getByRole('link', { name: 'Cvstr / HR Surveyors' })).toHaveAttribute('href', /commons\.wikimedia\.org/)
    await expect(page.getByText(/RTK FIX: EXCELLENT|Class A Passed|1:52,400/)).toHaveCount(0)
  })

  test('keeps the landing page focused on the survey workflow', async ({ page }) => {
    await page.goto('/')

    const workflow = page.locator('#workflow')
    for (const name of ['Set up the job', 'Bring in observations', 'Review and prepare outputs']) {
      await expect(workflow.getByRole('heading', { name })).toBeVisible()
    }
    await expect(page.getByRole('link', { name: 'Explore field workflows' })).toHaveAttribute('href', '/field')
    await expect(workflow.getByText(/ChatGPT/i)).toHaveCount(0)
  })

  test('shows pricing tiers, relevant guidance, and legal links', async ({ page }) => {
    await page.goto('/')

    for (const tier of ['Free', 'Pro', 'Team']) {
      await expect(page.getByRole('heading', { name: tier, exact: true })).toBeVisible()
    }
    const certification = page.locator('summary').filter({ hasText: 'Are METARDU drawings certified or automatically accepted?' })
    await expect(certification).toBeVisible()
    await certification.click()
    await expect(page.getByText(/A qualified surveyor must verify the source evidence/)).toBeVisible()
    await expect(page.locator('footer a[href="/docs/privacy"]')).toBeVisible()
    await expect(page.locator('footer a[href="/docs/terms"]')).toBeVisible()
    await expect(page.locator('a[href="#main-content"]')).toBeAttached()
  })
})
