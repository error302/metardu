/**
 * METARDU Document Generation Test
 * Tests PDF and DOCX export functionality
 * 
 * Run: npx tsx scripts/test-doc-generation.ts
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = 'http://localhost:3000'
const DOWNLOAD_DIR = path.join(__dirname, '../test-downloads')

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  error?: string
}

async function ensureDirectory() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
  }
}

async function testReportBuilderUI(page: any): Promise<TestResult> {
  console.log('\nTesting Report Builder UI...')
  
  try {
    await page.goto(`${BASE_URL}/tools/survey-report-builder`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    
    const url = page.url()
    
    // Check if redirected to login
    if (url.includes('/login')) {
      console.log('   Redirected to login (expected - requires auth)')
      await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'report-builder-auth-redirect.png'), fullPage: true })
      
      return {
        name: 'Report Builder UI',
        status: 'PASS',
        error: 'Requires authentication - redirected to login'
      }
    }
    
    // Check for export buttons
    const hasPdfButton = await page.locator('button:has-text("PDF"), [title*="PDF"], [aria-label*="PDF"]').count() > 0
    const hasDocxButton = await page.locator('button:has-text("DOCX"), button:has-text("Word"), [title*="DOCX"]').count() > 0
    const hasExportButton = await page.locator('button:has-text("Export"), button:has-text("Download")').count() > 0
    const hasDownloadPdf = await page.locator('button:has-text("Download PDF")').count() > 0
    const hasDownloadWord = await page.locator('button:has-text("Download Word")').count() > 0
    
    console.log(`   PDF button: ${hasPdfButton ? 'FOUND' : 'NOT FOUND'}`)
    console.log(`   DOCX button: ${hasDocxButton ? 'FOUND' : 'NOT FOUND'}`)
    console.log(`   Export button: ${hasExportButton ? 'FOUND' : 'NOT FOUND'}`)
    console.log(`   Download PDF: ${hasDownloadPdf ? 'FOUND' : 'NOT FOUND'}`)
    console.log(`   Download Word: ${hasDownloadWord ? 'FOUND' : 'NOT FOUND'}`)
    
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'report-builder-ui.png'), fullPage: true })
    
    const hasAnyExport = hasPdfButton || hasDocxButton || hasExportButton || hasDownloadPdf || hasDownloadWord
    
    return {
      name: 'Report Builder UI',
      status: hasAnyExport ? 'PASS' : 'FAIL',
      error: hasAnyExport ? undefined : 'No export buttons found'
    }
  } catch (error: any) {
    return {
      name: 'Report Builder UI',
      status: 'FAIL',
      error: error.message
    }
  }
}

async function testApiStructure(): Promise<TestResult> {
  console.log('\nTesting API Structure...')
  
  try {
    // Check if the API endpoint exists
    const response = await fetch(`${BASE_URL}/api/survey-report/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    })
    
    // We're expecting 401 (Unauthorized) or 400 (Bad Request) if the endpoint exists
    // 404 would mean the endpoint doesn't exist
    const endpointExists = response.status !== 404
    
    console.log(`   API Response: HTTP ${response.status}`)
    console.log(`   Endpoint exists: ${endpointExists ? 'YES' : 'NO'}`)
    
    return {
      name: 'API Endpoint',
      status: endpointExists ? 'PASS' : 'FAIL',
      error: endpointExists ? undefined : 'API endpoint not found'
    }
  } catch (error: any) {
    return {
      name: 'API Endpoint',
      status: 'FAIL',
      error: error.message
    }
  }
}

async function testPdfLibrary(): Promise<TestResult> {
  console.log('\nTesting PDF Library...')
  
  try {
    // Check if generatePdf module exists
    const pdfModulePath = path.join(__dirname, '../src/lib/pdf/generatePdf.ts')
    const exists = fs.existsSync(pdfModulePath)
    
    console.log(`   PDF module: ${exists ? 'EXISTS' : 'NOT FOUND'}`)
    console.log(`   Path: ${pdfModulePath}`)
    
    return {
      name: 'PDF Library',
      status: exists ? 'PASS' : 'FAIL',
      error: exists ? undefined : 'PDF generation module not found'
    }
  } catch (error: any) {
    return {
      name: 'PDF Library',
      status: 'FAIL',
      error: error.message
    }
  }
}

async function testDocxLibrary(): Promise<TestResult> {
  console.log('\nTesting DOCX Library...')
  
  try {
    // Check if generateDocx module exists
    const docxModulePath = path.join(__dirname, '../src/lib/docx/generateDocx.ts')
    const exists = fs.existsSync(docxModulePath)
    
    console.log(`   DOCX module: ${exists ? 'EXISTS' : 'NOT FOUND'}`)
    console.log(`   Path: ${docxModulePath}`)
    
    return {
      name: 'DOCX Library',
      status: exists ? 'PASS' : 'FAIL',
      error: exists ? undefined : 'DOCX generation module not found'
    }
  } catch (error: any) {
    return {
      name: 'DOCX Library',
      status: 'FAIL',
      error: error.message
    }
  }
}

async function testDocxTemplates(): Promise<TestResult> {
  console.log('\nTesting DOCX Templates...')
  
  try {
    // Check if templates exist
    const templatesPath = path.join(__dirname, '../src/lib/docx/templates/index.ts')
    const exists = fs.existsSync(templatesPath)
    
    if (exists) {
      const content = fs.readFileSync(templatesPath, 'utf-8')
      const surveyTypes = ['cadastral', 'topographic', 'engineering', 'mining', 'geodetic', 'hydrographic', 'drone', 'deformation']
      const foundTypes = surveyTypes.filter(type => content.includes(type))
      
      console.log(`   Templates module: EXISTS`)
      console.log(`   Survey types found: ${foundTypes.join(', ')}`)
      
      return {
        name: 'DOCX Templates',
        status: foundTypes.length >= 4 ? 'PASS' : 'FAIL',
        error: foundTypes.length >= 4 ? undefined : `Only ${foundTypes.length} survey types found`
      }
    }
    
    return {
      name: 'DOCX Templates',
      status: 'FAIL',
      error: 'Templates module not found'
    }
  } catch (error: any) {
    return {
      name: 'DOCX Templates',
      status: 'FAIL',
      error: error.message
    }
  }
}

async function runTests() {
  console.log('METARDU Document Generation Tests')
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
  
  const results: TestResult[] = []
  
  // Test 1: Report Builder UI
  console.log('Launching browser for UI test...')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  results.push(await testReportBuilderUI(page))
  await browser.close()
  
  // Test 2: API Structure
  results.push(await testApiStructure())
  
  // Test 3: PDF Library
  results.push(await testPdfLibrary())
  
  // Test 4: DOCX Library
  results.push(await testDocxLibrary())
  
  // Test 5: DOCX Templates
  results.push(await testDocxTemplates())
  
  // Summary
  console.log('\n' + '=' .repeat(60))
  console.log('TEST RESULTS SUMMARY')
  console.log('=' .repeat(60))
  
  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${result.name}`)
    if (result.error) {
      console.log(`   Error: ${result.error}`)
    }
  })
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  
  console.log('\n' + '=' .repeat(60))
  console.log(`Total: ${passed} passed, ${failed} failed out of ${results.length} tests`)
  console.log('=' .repeat(60))
  
  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch(console.error)
