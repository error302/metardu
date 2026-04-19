/**
 * METARDU Live Browser Test
 * Opens real browser and tests actual functionality
 * 
 * Run: npx tsx scripts/live-browser-test.ts
 */

import { chromium, Browser, Page, test } from 'playwright'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = 'http://localhost:3000'
const RESULTS_DIR = path.join(__dirname, '../live-test-results')

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  screenshot?: string
  error?: string
  duration: number
}

async function ensureDevServer() {
  console.log('🔍 Checking if dev server is running...')
  try {
    const response = await fetch(BASE_URL)
    if (response.ok) {
      console.log('✅ Dev server is running')
      return false
    }
  } catch {
    console.log('⚠️  Dev server not running. Starting...')
  }
  
  // Start dev server
  console.log('🚀 Starting Next.js dev server...')
  execSync('npm run dev', { 
    stdio: 'ignore', 
    detached: true,
    shell: true
  })
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 8000))
  return true
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const filename = path.join(RESULTS_DIR, `${name}.png`)
  await page.screenshot({ path: filename, fullPage: true })
  return filename
}

async function testAuthentication(page: Page): Promise<TestResult> {
  const start = Date.now()
  console.log('\n📝 TEST: Authentication')
  
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
    await takeScreenshot(page, 'login-page')
    
    // Check if login form exists
    const loginForm = page.locator('form')
    const hasLogin = await loginForm.count() > 0
    
    if (!hasLogin) {
      return {
        name: 'Authentication',
        status: 'FAIL',
        error: 'Login form not found',
        duration: Date.now() - start,
      }
    }
    
    return {
      name: 'Authentication',
      status: 'PASS',
      screenshot: 'login-page.png',
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Authentication',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function testProjectCreation(page: Page): Promise<TestResult> {
  const start = Date.now()
  console.log('\n📁 TEST: Project Creation')
  
  try {
    await page.goto(`${BASE_URL}/projects/new`, { waitUntil: 'networkidle' })
    await takeScreenshot(page, 'project-creation')
    
    const form = page.locator('form')
    const hasForm = await form.count() > 0
    
    return {
      name: 'Project Creation',
      status: hasForm ? 'PASS' : 'FAIL',
      screenshot: 'project-creation.png',
      error: !hasForm ? 'Project creation form not found' : undefined,
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Project Creation',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function testTraverseComputation(page: Page): Promise<TestResult> {
  const start = Date.now()
  console.log('\n📐 TEST: Traverse Computation')
  
  try {
    await page.goto(`${BASE_URL}/tools/traverse`, { waitUntil: 'networkidle' })
    await takeScreenshot(page, 'traverse-computation')
    
    const hasInput = await page.locator('input, textarea').count() > 0
    
    return {
      name: 'Traverse Computation',
      status: hasInput ? 'PASS' : 'FAIL',
      screenshot: 'traverse-computation.png',
      error: !hasInput ? 'Traverse computation page empty' : undefined,
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Traverse Computation',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function testSurveyReportBuilder(page: Page): Promise<TestResult> {
  const start = Date.now()
  console.log('\n📄 TEST: Survey Report Builder')
  
  try {
    await page.goto(`${BASE_URL}/tools/survey-report-builder`, { waitUntil: 'networkidle' })
    await takeScreenshot(page, 'survey-report-builder')
    
    const hasContent = await page.locator('text=Survey Report, text=Report, text=Project').count() > 0
    
    return {
      name: 'Survey Report Builder',
      status: hasContent ? 'PASS' : 'FAIL',
      screenshot: 'survey-report-builder.png',
      error: !hasContent ? 'Survey report builder not found' : undefined,
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Survey Report Builder',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function testDashboard(page: Page): Promise<TestResult> {
  const start = Date.now()
  console.log('\n📊 TEST: Dashboard')
  
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    await takeScreenshot(page, 'dashboard')
    
    // Dashboard might require auth, so we check for either content or login redirect
    const hasDashboard = await page.locator('text=Dashboard, text=Projects, text=Survey').count() > 0
    const isLoginRedirect = page.url().includes('login')
    
    return {
      name: 'Dashboard',
      status: hasDashboard || isLoginRedirect ? 'PASS' : 'FAIL',
      screenshot: 'dashboard.png',
      error: !hasDashboard && !isLoginRedirect ? 'Dashboard not accessible' : undefined,
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Dashboard',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function runTests() {
  console.log('🚀 METARDU Live Browser Test Suite')
  console.log('=' .repeat(50))
  
  // Ensure results directory exists
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }
  
  // Check/start dev server
  await ensureDevServer()
  
  // Launch browser
  console.log('\n🌐 Launching browser...')
  const browser = await chromium.launch({ 
    headless: false, // Show browser for visibility
    slowMo: 500, // Slow down for visibility
  })
  
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 }
  })
  
  const results: TestResult[] = []
  
  // Run tests
  results.push(await testAuthentication(page))
  results.push(await testProjectCreation(page))
  results.push(await testTraverseComputation(page))
  results.push(await testSurveyReportBuilder(page))
  results.push(await testDashboard(page))
  
  // Close browser
  await browser.close()
  
  // Generate report
  console.log('\n' + '='.repeat(50))
  console.log('📊 TEST RESULTS SUMMARY')
  console.log('=' .repeat(50))
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  
  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : '❌'
    const duration = `${result.duration}ms`
    console.log(`${icon} ${result.name}: ${result.status} (${duration})`)
    if (result.error) {
      console.log(`   └─ Error: ${result.error}`)
    }
    if (result.screenshot) {
      console.log(`   └─ Screenshot: ${result.screenshot}`)
    }
  })
  
  console.log('\n' + '='.repeat(50))
  console.log(`📈 Summary: ${passed} passed, ${failed} failed out of ${results.length} tests`)
  console.log(`📁 Results saved to: ${RESULTS_DIR}`)
  console.log('=' .repeat(50))
  
  // Generate HTML report
  const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <title>METARDU Live Test Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1B3A5C; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
    .stat { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: bold; }
    .stat-label { color: #666; margin-top: 5px; }
    .pass { color: #16a34a; }
    .fail { color: #dc2626; }
    .test { border: 1px solid #e5e7eb; margin: 15px 0; padding: 20px; border-radius: 8px; }
    .test.pass { border-left: 4px solid #16a34a; }
    .test.fail { border-left: 4px solid #dc2626; }
    .test-name { font-weight: bold; font-size: 18px; }
    .test-status { float: right; }
    .screenshot { margin-top: 15px; }
    .screenshot img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; }
    .error { color: #dc2626; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 METARDU Live Browser Test Results</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
      <div class="stat">
        <div class="stat-value pass">${passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value fail">${failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${results.length}</div>
        <div class="stat-label">Total Tests</div>
      </div>
    </div>
    
    <h2>Test Details</h2>
    ${results.map(r => `
      <div class="test ${r.status.toLowerCase()}">
        <div class="test-name">${r.name}</div>
        <span class="test-status ${r.status.toLowerCase()}">${r.status}</span>
        <div>Duration: ${r.duration}ms</div>
        ${r.error ? `<div class="error">Error: ${r.error}</div>` : ''}
        ${r.screenshot ? `
          <div class="screenshot">
            <strong>Screenshot:</strong><br>
            <img src="${r.screenshot}" alt="${r.name}">
          </div>
        ` : ''}
      </div>
    `).join('')}
  </div>
</body>
</html>
  `
  
  fs.writeFileSync(path.join(RESULTS_DIR, 'report.html'), htmlReport)
  console.log(`📄 HTML report: ${path.join(RESULTS_DIR, 'report.html')}`)
  
  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0)
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error)
}

export { runTests }
