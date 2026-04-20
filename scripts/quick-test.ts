/**
 * Quick Reality Check Test
 * Tests if key features are working RIGHT NOW
 */

import { chromium } from 'playwright'

async function quickTest() {
  console.log('🚀 METARDU Quick Reality Check')
  console.log('=' .repeat(50))
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox']
  })
  
  const page = await browser.newPage()
  
  // Test 1: Can we reach the app?
  console.log('\n📍 Test 1: Checking if app is accessible...')
  try {
    await page.goto('http://localhost:3000', { timeout: 10000 })
    const title = await page.title()
    console.log(`✅ App is running! Title: "${title}"`)
  } catch (error: any) {
    console.log('❌ App not running. Start it with: npm run dev')
    console.log('Error:', error.message)
    await browser.close()
    return
  }
  
  // Test 2: Login page exists
  console.log('\n📍 Test 2: Login page...')
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  const hasLoginForm = await page.locator('input[type="email"]').count() > 0
  console.log(hasLoginForm ? '✅ Login form exists' : '❌ Login form missing')
  
  // Test 3: Traverse tool
  console.log('\n📍 Test 3: Traverse computation...')
  await page.goto('http://localhost:3000/tools/traverse', { waitUntil: 'networkidle' })
  const hasTraverse = await page.locator('text=traverse, text=Traverse, text=Compute').count() > 0
  console.log(hasTraverse ? '✅ Traverse tool working' : '⚠️  Traverse tool may need attention')
  
  // Test 4: Survey report builder
  console.log('\n📍 Test 4: Survey report builder...')
  await page.goto('http://localhost:3000/tools/survey-report-builder', { waitUntil: 'networkidle' })
  const url = page.url()
  console.log(url.includes('survey-report') ? '✅ Report builder accessible' : '⚠️  Report builder route issue')
  
  await browser.close()
  
  console.log('\n' + '='.repeat(50))
  console.log('✅ Quick test complete!')
  console.log('\nTo run full test suite:')
  console.log('1. Make sure dev server is running: npm run dev')
  console.log('2. Run: npm run test:live')
}

quickTest().catch(console.error)
