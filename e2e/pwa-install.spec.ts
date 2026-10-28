import { test, expect } from '@playwright/test'

test('provides a public, responsive installation guide for both phone platforms', async ({ page }) => {
  await page.goto('/install')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your survey workspace. One tap away.')
  await expect(page.getByRole('heading', { name: 'Android', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'iPhone and iPad', exact: true })).toBeVisible()
  await expect(page.getByText(/Installation does not make every page/)).toBeVisible()
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json')
  await expect(page.locator('footer').getByRole('link', { name: 'Install the app' })).toHaveAttribute('href', '/install')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflow).toBe(false)
})
