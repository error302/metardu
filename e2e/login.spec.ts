import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('loads login page correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=Welcome back')).toBeVisible()
    await expect(page.locator('text=Sign in to your account')).toBeVisible()
  })

  test('has email and password input fields', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
  })

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/login')
    await page.click('button[type="submit"]')
    // Should show email validation error
    await expect(page.locator('text=Please enter your email address')).toBeVisible()
  })

  test('shows email format validation on invalid email', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]')
    await emailInput.fill('invalid-email')
    await emailInput.blur()
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible()
  })

  test('password show/hide toggle works', async ({ page }) => {
    await page.goto('/login')
    const passwordInput = page.locator('input[type="password"]')
    const toggleBtn = page.locator('button[type="button"]').filter({ has: page.locator('svg') }).first()
    
    await passwordInput.fill('testpassword')
    await toggleBtn.click()
    // After clicking, input type should change to text
    await expect(page.locator('input[type="text"]')).toBeVisible()
    
    // Click again to hide
    await toggleBtn.click()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('remember me checkbox is present', async ({ page }) => {
    await page.goto('/login')
    const checkbox = page.locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible()
    await expect(page.locator('text=Remember me')).toBeVisible()
  })

  test('forgot password link switches view', async ({ page }) => {
    await page.goto('/login')
    // Wait for the login form to be fully rendered
    await expect(page.locator('text=Welcome back')).toBeVisible()
    // Click forgot password and wait for view to change
    await page.click('text=Forgot password?')
    // Wait for the reset view to appear
    await expect(page.locator('text=Reset your password')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Send Reset Link')).toBeVisible()
  })

  test('forgot password validates email on empty submit', async ({ page }) => {
    await page.goto('/login')
    await page.click('text=Forgot password?')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Please enter your email address')).toBeVisible()
  })

  test('back button returns from forgot password to login', async ({ page }) => {
    await page.goto('/login')
    await page.click('text=Forgot password?')
    await page.click('text=Back to sign in')
    await expect(page.locator('text=Welcome back')).toBeVisible()
  })

  test('register link is present on login page', async ({ page }) => {
    await page.goto('/login')
    const registerLink = page.locator('a[href="/register"]').first()
    await expect(registerLink).toBeVisible()
    // Verify the link points to the correct destination
    await expect(registerLink).toHaveAttribute('href', '/register')
  })

  test('METARDU branding visible on mobile', async ({ page }) => {
    await page.goto('/login')
    // Mobile-only METARDU link
    const mobileBranding = page.locator('a.text-2xl')
    await expect(mobileBranding).toBeAttached()
  })

  test('left panel shows compliance checklist on desktop', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=Kenya Survey Regulations compliant')).toBeVisible()
    await expect(page.locator('text=Works offline in the field')).toBeVisible()
    await expect(page.locator('text=Trusted by surveyors across East Africa')).toBeVisible()
  })
})
