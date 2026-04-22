/**
 * Test Dashboard Auth Redirect
 * Verifies that /dashboard redirects to /login when not authenticated
 */

import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:3000'

async function testDashboardRedirect() {
  console.log('Testing Dashboard Auth Redirect...\n')
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  
  try {
    // Clear any existing cookies/session
    await context.clearCookies()
    
    console.log('1. Testing unauthenticated access to /dashboard...')
    
    // Track navigation
    const navigations: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url())
      }
    })
    
    // Try to access dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    
    const finalUrl = page.url()
    console.log(`   Initial navigation: ${navigations[0] || 'N/A'}`)
    console.log(`   Final URL: ${finalUrl}`)
    
    if (finalUrl.includes('/login')) {
      console.log('   ✅ PASS: Dashboard redirected to /login')
    } else if (finalUrl.includes('/dashboard')) {
      console.log('   ❌ FAIL: Dashboard accessible without auth')
      
      // Check what's on the page
      const pageTitle = await page.title()
      const hasDashboardContent = await page.locator('text=Dashboard, text=Projects, text=Welcome').count() > 0
      console.log(`   Page title: ${pageTitle}`)
      console.log(`   Has dashboard content: ${hasDashboardContent ? 'YES' : 'NO'}`)
    } else {
      console.log(`   ⚠️  Unexpected redirect to: ${finalUrl}`)
    }
    
    // Take screenshot
    await page.screenshot({ path: 'live-test-results/dashboard-auth-test.png', fullPage: true })
    console.log('   Screenshot saved: dashboard-auth-test.png')
    
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await browser.close()
  }
}

testDashboardRedirect().catch(console.error)
