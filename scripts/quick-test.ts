/**
 * METARDU Quick Smoke Test
 * Tests that the app loads and basic functionality works
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = 'http://localhost:3000'
const RESULTS_DIR = path.join(__dirname, '../live-test-results')

async function runQuickTests() {
  console.log('METARDU Quick Smoke Test')
  console.log('=' .repeat(50))
  
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }
  
  // Check if server is running
  console.log('Checking dev server...')
  try {
    const response = await fetch(BASE_URL)
    if (!response.ok) {
      console.log('ERROR: Dev server not running')
      process.exit(1)
    }
    console.log('Dev server is running')
  } catch {
    console.log('ERROR: Dev server not running')
    process.exit(1)
  }
  
  console.log('\nLaunching browser...')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  const tests = []
  
  // Test 1: Home page
  console.log('\n1. Testing Home page...')
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.screenshot({ path: path.join(RESULTS_DIR, 'home.png'), fullPage: true })
    const title = await page.title()
    const hasContent = await page.locator('h1, h2, [class*="hero"], [class*="landing"]').count() > 0
    console.log(`   Title: ${title}`)
    console.log(`   Has content: ${hasContent ? 'YES' : 'NO'}`)
    tests.push({ name: 'Home Page', status: hasContent ? 'PASS' : 'FAIL' })
  } catch (e: any) {
    console.log(`   ERROR: ${e.message}`)
    tests.push({ name: 'Home Page', status: 'FAIL', error: e.message })
  }
  
  // Test 2: Login page
  console.log('\n2. Testing Login page...')
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.screenshot({ path: path.join(RESULTS_DIR, 'login.png'), fullPage: true })
    const hasForm = await page.locator('form').count() > 0
    const hasEmailInput = await page.locator('input[type="email"]').count() > 0
    const hasPasswordInput = await page.locator('input[type="password"]').count() > 0
    console.log(`   Form found: ${hasForm ? 'YES' : 'NO'}`)
    console.log(`   Email input: ${hasEmailInput ? 'YES' : 'NO'}`)
    console.log(`   Password input: ${hasPasswordInput ? 'YES' : 'NO'}`)
    tests.push({ name: 'Login Page', status: hasForm && hasEmailInput && hasPasswordInput ? 'PASS' : 'FAIL' })
  } catch (e: any) {
    console.log(`   ERROR: ${e.message}`)
    tests.push({ name: 'Login Page', status: 'FAIL', error: e.message })
  }
  
  // Test 3: Dashboard (should redirect to login if not authenticated)
  console.log('\n3. Testing Dashboard (public access)...')
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.screenshot({ path: path.join(RESULTS_DIR, 'dashboard.png'), fullPage: true })
    const url = page.url()
    const redirectedToLogin = url.includes('/login')
    console.log(`   URL: ${url}`)
    console.log(`   Redirected to login: ${redirectedToLogin ? 'YES' : 'NO'}`)
    tests.push({ name: 'Dashboard Auth', status: redirectedToLogin ? 'PASS' : 'FAIL' })
  } catch (e: any) {
    console.log(`   ERROR: ${e.message}`)
    tests.push({ name: 'Dashboard Auth', status: 'FAIL', error: e.message })
  }
  
  // Test 4: Traverse tool
  console.log('\n4. Testing Traverse tool...')
  try {
    await page.goto(`${BASE_URL}/tools/traverse`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.screenshot({ path: path.join(RESULTS_DIR, 'traverse.png'), fullPage: true })
    const hasInput = await page.locator('input, textarea').count() > 0
    console.log(`   Has inputs: ${hasInput ? 'YES' : 'NO'}`)
    tests.push({ name: 'Traverse Tool', status: hasInput ? 'PASS' : 'FAIL' })
  } catch (e: any) {
    console.log(`   ERROR: ${e.message}`)
    tests.push({ name: 'Traverse Tool', status: 'FAIL', error: e.message })
  }
  
  // Test 5: Survey Report Builder
  console.log('\n5. Testing Survey Report Builder...')
  try {
    await page.goto(`${BASE_URL}/tools/survey-report-builder`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.screenshot({ path: path.join(RESULTS_DIR, 'survey-report.png'), fullPage: true })
    const url = page.url()
    const hasContent = await page.locator('h1, h2, select, button').count() > 0
    console.log(`   URL: ${url}`)
    console.log(`   Has content: ${hasContent ? 'YES' : 'NO'}`)
    tests.push({ name: 'Survey Report Builder', status: hasContent ? 'PASS' : 'FAIL' })
  } catch (e: any) {
    console.log(`   ERROR: ${e.message}`)
    tests.push({ name: 'Survey Report Builder', status: 'FAIL', error: e.message })
  }
  
  await browser.close()
  
  // Summary
  console.log('\n' + '=' .repeat(50))
  console.log('TEST RESULTS SUMMARY')
  console.log('=' .repeat(50))
  
  const passed = tests.filter(t => t.status === 'PASS').length
  const failed = tests.filter(t => t.status === 'FAIL').length
  
  tests.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${test.name}: ${test.status}`)
    if (test.error) console.log(`   Error: ${test.error}`)
  })
  
  console.log('\n' + '=' .repeat(50))
  console.log(`Summary: ${passed} passed, ${failed} failed out of ${tests.length} tests`)
  console.log(`Screenshots saved to: ${RESULTS_DIR}`)
  console.log('=' .repeat(50))
  
  process.exit(failed > 0 ? 1 : 0)
}

if (require.main === module) {
  runQuickTests().catch(console.error)
}
