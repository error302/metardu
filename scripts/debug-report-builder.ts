/**
 * Debug Report Builder - Check what's actually on the page
 */

import { chromium } from 'playwright'
import * as path from 'path'

const BASE_URL = 'http://localhost:3000'

async function debugReportBuilder() {
  console.log('Debugging Report Builder...\n')
  
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  try {
    // Navigate to report builder
    await page.goto(`${BASE_URL}/tools/survey-report-builder`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(3000)
    
    const url = page.url()
    console.log('URL:', url)
    
    // Get page content
    const content = await page.content()
    
    // Check for key elements
    const hasButtons = await page.locator('button').count()
    console.log('Number of buttons:', hasButtons)
    
    // Get all button text
    const buttons = await page.locator('button').allInnerTexts()
    console.log('\nButton texts:')
    buttons.forEach((text, i) => {
      if (text.trim()) console.log(`  ${i}: "${text.trim().substring(0, 50)}"`)
    })
    
    // Check for specific text
    const hasDownload = content.includes('Download')
    const hasPDF = content.includes('PDF')
    const hasWord = content.includes('Word') || content.includes('DOCX')
    const hasExport = content.includes('Export')
    const hasPreview = content.includes('Preview')
    const hasSurvey = content.includes('Survey')
    const hasReport = content.includes('Report')
    
    console.log('\nText found:')
    console.log('  Download:', hasDownload ? 'YES' : 'NO')
    console.log('  PDF:', hasPDF ? 'YES' : 'NO')
    console.log('  Word/DOCX:', hasWord ? 'YES' : 'NO')
    console.log('  Export:', hasExport ? 'YES' : 'NO')
    console.log('  Preview:', hasPreview ? 'YES' : 'NO')
    console.log('  Survey:', hasSurvey ? 'YES' : 'NO')
    console.log('  Report:', hasReport ? 'YES' : 'NO')
    
    // Save HTML content for debugging
    const fs = await import('fs')
    fs.writeFileSync(path.join(__dirname, '../test-downloads/report-builder-debug.html'), content)
    
    // Save screenshot and HTML
    await page.screenshot({ path: path.join(__dirname, '../test-downloads/report-builder-debug.png'), fullPage: true })
    
    console.log('\nScreenshot saved to: test-downloads/report-builder-debug.png')
    
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await browser.close()
  }
}

debugReportBuilder().catch(console.error)
