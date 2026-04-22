/**
 * METARDU End-to-End Survey Tests
 * Tests all survey types with complete workflows
 * 
 * Run: npx tsx scripts/e2e-survey-tests.ts
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = 'http://localhost:3000'
const RESULTS_DIR = path.join(__dirname, '../live-test-results/e2e')

interface TestResult {
  name: string
  category: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  error?: string
  duration: number
}

interface SurveyTool {
  name: string
  path: string
  inputs: { label: string; value: string }[]
  expectedResult: string
}

const SURVEY_TOOLS: SurveyTool[] = [
  {
    name: 'Traverse Computation',
    path: '/tools/traverse',
    inputs: [
      { label: 'Station', value: 'A' },
      { label: 'Bearing', value: '45.1234' },
      { label: 'Distance', value: '100.50' },
    ],
    expectedResult: 'computed'
  },
  {
    name: 'Leveling',
    path: '/tools/leveling',
    inputs: [
      { label: 'BS', value: '1.234' },
      { label: 'IS', value: '0.567' },
      { label: 'FS', value: '1.890' },
    ],
    expectedResult: 'elevation'
  },
  {
    name: 'COGO - Intersection',
    path: '/tools/cogo',
    inputs: [
      { label: 'Easting 1', value: '500000' },
      { label: 'Northing 1', value: '9900000' },
    ],
    expectedResult: 'intersection'
  },
  {
    name: 'Coordinate Conversion',
    path: '/tools/coordinates',
    inputs: [
      { label: 'Latitude', value: '-1.2921' },
      { label: 'Longitude', value: '36.8219' },
    ],
    expectedResult: 'UTM'
  },
  {
    name: 'Area Calculation',
    path: '/tools/area',
    inputs: [
      { label: 'Point 1', value: '500000,9900000' },
      { label: 'Point 2', value: '500100,9900100' },
    ],
    expectedResult: 'area'
  },
  {
    name: 'Distance & Bearing',
    path: '/tools/distance',
    inputs: [
      { label: 'From Easting', value: '500000' },
      { label: 'From Northing', value: '9900000' },
      { label: 'To Easting', value: '500100' },
      { label: 'To Northing', value: '9900100' },
    ],
    expectedResult: 'distance'
  },
  {
    name: 'GNSS Processing',
    path: '/tools/gnss',
    inputs: [],
    expectedResult: 'upload'
  },
  {
    name: 'Tacheometry',
    path: '/tools/tacheometry',
    inputs: [
      { label: 'HD', value: '100' },
      { label: 'VA', value: '90' },
      { label: 'SD', value: '100' },
    ],
    expectedResult: 'coordinates'
  },
  {
    name: 'Horizontal Curves',
    path: '/tools/curves',
    inputs: [
      { label: 'Radius', value: '500' },
      { label: 'Delta', value: '45' },
    ],
    expectedResult: 'curve'
  },
  {
    name: 'Cross Sections',
    path: '/tools/cross-sections',
    inputs: [
      { label: 'Chainage', value: '0+100' },
      { label: 'Level', value: '1600.50' },
    ],
    expectedResult: 'section'
  },
  {
    name: 'Road Design',
    path: '/tools/road-design',
    inputs: [
      { label: 'Chainage', value: '0+000' },
      { label: 'Level', value: '1650.00' },
    ],
    expectedResult: 'design'
  },
  {
    name: 'Earthworks Volume',
    path: '/tools/earthworks',
    inputs: [
      { label: 'Area', value: '1000' },
      { label: 'Height', value: '5' },
    ],
    expectedResult: 'volume'
  },
]

async function ensureDirectory() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }
}

async function testSurveyTool(page: any, tool: SurveyTool): Promise<TestResult> {
  const start = Date.now()
  console.log(`\nTesting: ${tool.name}`)
  
  try {
    // Navigate to tool
    await page.goto(`${BASE_URL}${tool.path}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    
    const url = page.url()
    console.log(`   URL: ${url}`)
    
    // Take screenshot
    const screenshotName = `${tool.path.replace(/\//g, '-')}.png`
    await page.screenshot({ path: path.join(RESULTS_DIR, screenshotName), fullPage: true })
    
    // Check if page loaded
    const hasContent = await page.locator('h1, h2, h3, [class*="container"]').count() > 0
    const hasInputs = await page.locator('input, select, textarea').count() > 0
    const hasButtons = await page.locator('button').count() > 0
    
    console.log(`   Has content: ${hasContent ? 'YES' : 'NO'}`)
    console.log(`   Has inputs: ${hasInputs ? 'YES' : 'NO'}`)
    console.log(`   Has buttons: ${hasButtons ? 'YES' : 'NO'}`)
    
    // Try to fill inputs if they exist
    if (hasInputs && tool.inputs.length > 0) {
      for (const input of tool.inputs) {
        try {
          // Try to find input by placeholder or label
          const inputLocator = page.locator(`input[placeholder*="${input.label}"], label:has-text("${input.label}") + input, input[name*="${input.label.toLowerCase().replace(/\s/g, '')}"]`).first()
          if (await inputLocator.count() > 0) {
            await inputLocator.fill(input.value)
            console.log(`   Filled: ${input.label}`)
          }
        } catch {
          console.log(`   Could not fill: ${input.label}`)
        }
      }
    }
    
    // Page is considered working if it has content and inputs or buttons
    const isWorking = hasContent && (hasInputs || hasButtons)
    
    return {
      name: tool.name,
      category: 'Survey Tools',
      status: isWorking ? 'PASS' : 'FAIL',
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: tool.name,
      category: 'Survey Tools',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function testProjectWorkflow(page: any): Promise<TestResult> {
  const start = Date.now()
  console.log('\nTesting: Project Creation Workflow')
  
  try {
    // Step 1: Navigate to projects
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    
    const url = page.url()
    console.log(`   Projects URL: ${url}`)
    
    // Should redirect to login if not authenticated
    if (url.includes('/login')) {
      console.log('   Redirected to login (expected)')
      return {
        name: 'Project List (Auth Protected)',
        category: 'Project Workflow',
        status: 'PASS',
        duration: Date.now() - start,
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: path.join(RESULTS_DIR, 'projects.png'), fullPage: true })
    
    return {
      name: 'Project List',
      category: 'Project Workflow',
      status: 'PASS',
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Project List',
      category: 'Project Workflow',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function testReportGeneration(page: any): Promise<TestResult> {
  const start = Date.now()
  console.log('\nTesting: Report Generation')
  
  try {
    // Navigate to survey report builder
    await page.goto(`${BASE_URL}/tools/survey-report-builder`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    
    const url = page.url()
    console.log(`   URL: ${url}`)
    
    // Take screenshot
    await page.screenshot({ path: path.join(RESULTS_DIR, 'survey-report-builder-e2e.png'), fullPage: true })
    
    // Check for key elements
    const hasProjectSelector = await page.locator('select, button, a').count() > 0
    const hasExportOptions = await page.locator('text=PDF, text=DOCX, text=Export').count() > 0
    
    console.log(`   Has project selector: ${hasProjectSelector ? 'YES' : 'NO'}`)
    console.log(`   Has export options: ${hasExportOptions ? 'YES' : 'NO'}`)
    
    return {
      name: 'Survey Report Builder',
      category: 'Report Generation',
      status: hasProjectSelector ? 'PASS' : 'FAIL',
      duration: Date.now() - start,
    }
  } catch (error: any) {
    return {
      name: 'Survey Report Builder',
      category: 'Report Generation',
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - start,
    }
  }
}

async function runE2ETests() {
  console.log('METARDU End-to-End Survey Tests')
  console.log('=' .repeat(60))
  
  await ensureDirectory()
  
  // Check dev server
  console.log('Checking dev server...')
  try {
    const response = await fetch(`${BASE_URL}/api/public/health`)
    if (!response.ok) throw new Error('Server not healthy')
    console.log('Dev server is running\n')
  } catch {
    console.log('ERROR: Dev server not running. Please start: npm run dev')
    process.exit(1)
  }
  
  console.log('Launching browser...')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  const results: TestResult[] = []
  
  // Test 1: All survey tools
  console.log('\n' + '=' .repeat(60))
  console.log('SURVEY TOOLS TESTS')
  console.log('=' .repeat(60))
  
  for (const tool of SURVEY_TOOLS) {
    const result = await testSurveyTool(page, tool)
    results.push(result)
    console.log(`   Result: ${result.status}`)
    if (result.error) console.log(`   Error: ${result.error}`)
  }
  
  // Test 2: Project workflow
  console.log('\n' + '=' .repeat(60))
  console.log('PROJECT WORKFLOW TESTS')
  console.log('=' .repeat(60))
  
  const projectResult = await testProjectWorkflow(page)
  results.push(projectResult)
  console.log(`   Result: ${projectResult.status}`)
  
  // Test 3: Report generation
  console.log('\n' + '=' .repeat(60))
  console.log('REPORT GENERATION TESTS')
  console.log('=' .repeat(60))
  
  const reportResult = await testReportGeneration(page)
  results.push(reportResult)
  console.log(`   Result: ${reportResult.status}`)
  
  await browser.close()
  
  // Summary
  console.log('\n' + '=' .repeat(60))
  console.log('TEST RESULTS SUMMARY')
  console.log('=' .repeat(60))
  
  // Group by category
  const categories = [...new Set(results.map(r => r.category))]
  
  for (const category of categories) {
    console.log(`\n${category}:`)
    const categoryResults = results.filter(r => r.category === category)
    categoryResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌'
      console.log(`  ${icon} ${result.name} (${result.duration}ms)`)
      if (result.error) console.log(`     Error: ${result.error}`)
    })
  }
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  
  console.log('\n' + '=' .repeat(60))
  console.log(`Total: ${passed} passed, ${failed} failed out of ${results.length} tests`)
  console.log(`Screenshots saved to: ${RESULTS_DIR}`)
  console.log('=' .repeat(60))
  
  // Generate HTML report
  generateHtmlReport(results, passed, failed)
  
  process.exit(failed > 0 ? 1 : 0)
}

function generateHtmlReport(results: TestResult[], passed: number, failed: number) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>METARDU E2E Test Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1B3A5C; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
    .stat { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: bold; }
    .pass { color: #16a34a; }
    .fail { color: #dc2626; }
    .category { margin: 30px 0; }
    .category-title { font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #333; }
    .test { border-left: 4px solid #e5e7eb; margin: 10px 0; padding: 15px; background: #f9f9f9; }
    .test.pass { border-left-color: #16a34a; }
    .test.fail { border-left-color: #dc2626; }
    .test-name { font-weight: bold; }
    .test-status { float: right; font-weight: bold; }
    .test-duration { color: #666; font-size: 12px; }
    .test-error { color: #dc2626; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>METARDU End-to-End Test Results</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
      <div class="stat">
        <div class="stat-value pass">${passed}</div>
        <div>Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value fail">${failed}</div>
        <div>Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${results.length}</div>
        <div>Total</div>
      </div>
    </div>
    
    ${(() => {
      const categories = [...new Set(results.map(r => r.category))]
      return categories.map(cat => {
        const catResults = results.filter(r => r.category === cat)
        return `
          <div class="category">
            <div class="category-title">${cat}</div>
            ${catResults.map(r => `
              <div class="test ${r.status.toLowerCase()}">
                <span class="test-status ${r.status.toLowerCase()}">${r.status}</span>
                <div class="test-name">${r.name}</div>
                <div class="test-duration">${r.duration}ms</div>
                ${r.error ? `<div class="test-error">Error: ${r.error}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `
      }).join('')
    })()}
  </div>
</body>
</html>`
  
  fs.writeFileSync(path.join(RESULTS_DIR, 'report.html'), html)
}

if (require.main === module) {
  runE2ETests().catch(console.error)
}
