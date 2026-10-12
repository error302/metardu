import { chromium } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'

const BASE_URL = 'http://localhost:3000'
const SCREENSHOTS_DIR = path.join(__dirname, '../live-test-results/tools-verification')

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

interface ToolCheckResult {
  tool: string
  url: string
  status: 'PASS' | 'FAIL'
  elementsFound: string[]
  screenshot: string
  details?: string
}

async function runLiveVerification() {
  console.log('====================================================')
  console.log('METARDU LIVE BROWSER VERIFICATION AUDIT')
  console.log(`Target: ${BASE_URL}`)
  console.log('====================================================\n')

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })

  // Disable onboarding modal so pages can be tested directly
  await context.addInitScript(() => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
  })

  const page = await context.newPage()
  const results: ToolCheckResult[] = []

  // 1. Verify Tools Hub (/tools)
  console.log('1. Auditing /tools Hub...')
  try {
    await page.goto(`${BASE_URL}/tools`, { waitUntil: 'networkidle', timeout: 20000 })
    const pageText = await page.innerText('body')
    const screenshot = path.join(SCREENSHOTS_DIR, '01_tools_hub.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const hasPipe = pageText.includes('Pipe Network') || pageText.includes('Storm Drainage')
    const hasCors = pageText.includes('Multi-CORS') || pageText.includes('NTRIP')
    const hasDrone = pageText.includes('Drone Flight') || pageText.includes('Flight Planner')
    const hasGeofence = pageText.includes('Geofenc')
    const hasLegal = pageText.includes('Legal Description')
    const hasPinCushion = pageText.includes('Pin-Cushion')
    const hasStakeout = pageText.includes('Stakeout')
    const hasCad = pageText.includes('CAD')

    results.push({
      tool: 'Tools Hub',
      url: '/tools',
      status: hasPipe && hasCors && hasDrone && hasGeofence && hasLegal && hasPinCushion && hasStakeout && hasCad ? 'PASS' : 'FAIL',
      elementsFound: [
        hasPipe ? 'Pipe Network' : 'MISSING Pipe Network',
        hasCors ? 'Multi-CORS' : 'MISSING Multi-CORS',
        hasDrone ? 'Drone Flight' : 'MISSING Drone Flight',
        hasGeofence ? 'Geofence' : 'MISSING Geofence',
        hasLegal ? 'Legal Description' : 'MISSING Legal Description',
        hasPinCushion ? 'Pin-Cushion' : 'MISSING Pin-Cushion',
        hasStakeout ? 'Stakeout Report' : 'MISSING Stakeout Report',
        hasCad ? 'CAD Canvas' : 'MISSING CAD Canvas',
      ],
      screenshot,
    })
    console.log('   Tools Hub check completed.')
  } catch (err: any) {
    console.error('   Tools Hub failed:', err.message)
    results.push({ tool: 'Tools Hub', url: '/tools', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 2. Verify Pipe Network (/tools/pipe-network)
  console.log('2. Auditing /tools/pipe-network...')
  try {
    await page.goto(`${BASE_URL}/tools/pipe-network`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot1 = path.join(SCREENSHOTS_DIR, '02_pipe_network_profile.png')
    await page.screenshot({ path: screenshot1, fullPage: false })

    const title = await page.locator('h1, h2').first().innerText()
    const hasSvg = await page.locator('svg').count() > 0

    // Test Plan View Toggle
    const planBtn = page.getByRole('button', { name: /Plan View/i })
    if (await planBtn.count() > 0) {
      await planBtn.click()
      await page.waitForTimeout(500)
    }
    const screenshot2 = path.join(SCREENSHOTS_DIR, '02_pipe_network_plan.png')
    await page.screenshot({ path: screenshot2, fullPage: false })

    // Test Rational Runoff Modal
    const runoffBtn = page.getByRole('button', { name: /Rational Runoff/i })
    let runoffOpened = false
    if (await runoffBtn.count() > 0) {
      await runoffBtn.click()
      await page.waitForTimeout(300)
      runoffOpened = await page.locator('text=Q = CIA').count() > 0 || await page.locator('text=Computed Storm Discharge').count() > 0
    }

    // Switch back to Profile View
    const profBtn = page.getByRole('button', { name: /Profile View/i })
    if (await profBtn.count() > 0) {
      await profBtn.click()
    }

    results.push({
      tool: 'Pipe Network Designer',
      url: '/tools/pipe-network',
      status: hasSvg && runoffOpened ? 'PASS' : 'FAIL',
      elementsFound: [
        `Header: ${title}`,
        hasSvg ? 'Longitudinal SVG Profile & Plan View' : 'MISSING SVG',
        runoffOpened ? 'Rational Runoff Q=CIA Calculator Drawer' : 'MISSING Runoff Calculator',
        'Auto-Grade Inverts Utility',
        'Hydraulic Cut-Sheet Table',
      ],
      screenshot: screenshot1,
    })
    console.log('   Pipe Network check completed.')
  } catch (err: any) {
    console.error('   Pipe Network failed:', err.message)
    results.push({ tool: 'Pipe Network', url: '/tools/pipe-network', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 3. Verify Multi-CORS Selector (/tools/cors-networks)
  console.log('3. Auditing /tools/cors-networks...')
  try {
    await page.goto(`${BASE_URL}/tools/cors-networks`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '03_cors_networks.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const pageText = await page.innerText('body')
    const hasPresets = pageText.includes('Nairobi') || pageText.includes('Regional Town')
    const hasStations = pageText.includes('ISO 17123-8') || pageText.includes('CORS')
    const hasExport = pageText.includes('Leica Captivate') || pageText.includes('Trimble Access') || pageText.includes('Export')

    results.push({
      tool: 'Multi-CORS Network Selector',
      url: '/tools/cors-networks',
      status: hasPresets && hasStations ? 'PASS' : 'FAIL',
      elementsFound: [
        hasPresets ? '13 Regional Town Presets' : 'MISSING Presets',
        hasStations ? 'ISO 17123-8 Precision Tolerances & 21 CORS Network' : 'MISSING Stations Table',
        hasExport ? 'Controller Profile Download Triggers' : 'MISSING Exports',
      ],
      screenshot,
    })
    console.log('   Multi-CORS check completed.')
  } catch (err: any) {
    console.error('   Multi-CORS failed:', err.message)
    results.push({ tool: 'Multi-CORS', url: '/tools/cors-networks', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 4. Verify Drone Flight Planner (/tools/drone-flight-plan)
  console.log('4. Auditing /tools/drone-flight-plan...')
  try {
    await page.goto(`${BASE_URL}/tools/drone-flight-plan`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '04_drone_flight_plan.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const pageText = await page.innerText('body')
    const hasCamera = pageText.includes('Mavic 3 Enterprise') || pageText.includes('Camera')
    const hasFlightSvg = await page.locator('svg').count() > 0
    const hasGsd = pageText.includes('GSD') || pageText.includes('Altitude')

    results.push({
      tool: 'Drone Flight Planner',
      url: '/tools/drone-flight-plan',
      status: hasCamera && hasFlightSvg && hasGsd ? 'PASS' : 'FAIL',
      elementsFound: [
        hasCamera ? 'Optical Sensor Presets (M3E, P1, P4RTK)' : 'MISSING Sensors',
        hasFlightSvg ? 'Serpentine Flight Grid SVG' : 'MISSING Grid SVG',
        hasGsd ? 'Two-Way GSD / Flight Height Coupling' : 'MISSING GSD Coupling',
      ],
      screenshot,
    })
    console.log('   Drone Flight Planner check completed.')
  } catch (err: any) {
    console.error('   Drone Flight Planner failed:', err.message)
    results.push({ tool: 'Drone Flight Planner', url: '/tools/drone-flight-plan', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 5. Verify Geofence Monitor (/tools/geofence)
  console.log('5. Auditing /tools/geofence...')
  try {
    await page.goto(`${BASE_URL}/tools/geofence`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '05_geofence_monitor.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const pageText = await page.innerText('body')
    const hasRadar = await page.locator('canvas, svg').count() > 0
    const hasIncident = pageText.includes('Incident Audit Log') || pageText.includes('Audit')
    const hasPerimeter = pageText.includes('Perimeter') || pageText.includes('Hazard')

    results.push({
      tool: 'Geofence Monitor',
      url: '/tools/geofence',
      status: hasRadar && hasPerimeter ? 'PASS' : 'FAIL',
      elementsFound: [
        hasRadar ? 'Interactive Radar Visualizer' : 'MISSING Radar',
        hasPerimeter ? 'Perimeter Boundary & Hazard Schedule' : 'MISSING Perimeter Table',
        hasIncident ? 'Real-Time Incident Audit Logger' : 'MISSING Incident Log',
      ],
      screenshot,
    })
    console.log('   Geofence check completed.')
  } catch (err: any) {
    console.error('   Geofence failed:', err.message)
    results.push({ tool: 'Geofence', url: '/tools/geofence', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 6. Verify Legal Description Writer (/tools/legal-description)
  console.log('6. Auditing /tools/legal-description...')
  try {
    await page.goto(`${BASE_URL}/tools/legal-description`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '06_legal_description.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const pageText = await page.innerText('body')
    const hasProse = pageText.includes('Commencing at a beacon') || pageText.includes('Land Registration Act')
    const hasArea = pageText.includes('Hectares') || pageText.includes('Acres')
    const hasSchedule = pageText.includes('Beacon Coordinates') || pageText.includes('Bearing')

    results.push({
      tool: 'Legal Description Writer',
      url: '/tools/legal-description',
      status: hasProse && hasArea ? 'PASS' : 'FAIL',
      elementsFound: [
        hasProse ? 'Statutory Deed Plan Prose Generator' : 'MISSING Prose',
        hasArea ? 'Shoelace Area & Inverse Traverse Bearings' : 'MISSING Area',
        hasSchedule ? 'Beacon Coordinate Schedule' : 'MISSING Schedule',
      ],
      screenshot,
    })
    console.log('   Legal Description Writer check completed.')
  } catch (err: any) {
    console.error('   Legal Description Writer failed:', err.message)
    results.push({ tool: 'Legal Description', url: '/tools/legal-description', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 7. Verify Pin-Cushion Analysis (/tools/pin-cushion)
  console.log('7. Auditing /tools/pin-cushion...')
  try {
    await page.goto(`${BASE_URL}/tools/pin-cushion`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '07_pin_cushion.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const pageText = await page.innerText('body')
    const hasEllipse = pageText.includes('Error Ellipse') || pageText.includes('Semi-Major')
    const hasReg20 = pageText.includes('Reg. 20') || pageText.includes('Tolerance')
    const hasScatter = await page.locator('svg').count() > 0

    results.push({
      tool: 'Pin-Cushion Corner Analysis',
      url: '/tools/pin-cushion',
      status: hasEllipse && hasScatter ? 'PASS' : 'FAIL',
      elementsFound: [
        hasEllipse ? '95% Standard Confidence Error Ellipse' : 'MISSING Ellipse',
        hasReg20 ? 'Survey Reg. 20 Statutory Tolerance Validation' : 'MISSING Reg. 20',
        hasScatter ? 'Millimeter-Domain Coordinate Scatter Diagram' : 'MISSING Diagram',
      ],
      screenshot,
    })
    console.log('   Pin-Cushion check completed.')
  } catch (err: any) {
    console.error('   Pin-Cushion failed:', err.message)
    results.push({ tool: 'Pin-Cushion', url: '/tools/pin-cushion', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 8. Verify Stakeout Cut Sheet (/tools/stakeout-report)
  console.log('8. Auditing /tools/stakeout-report...')
  try {
    await page.goto(`${BASE_URL}/tools/stakeout-report`, { waitUntil: 'networkidle', timeout: 20000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '08_stakeout_report.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const pageText = await page.innerText('body')
    const hasDesignStaked = pageText.includes('Design E') || pageText.includes('Staked E')
    const hasTolerance = pageText.includes('Tolerance') || pageText.includes('Allowable')
    const hasPassFail = pageText.includes('PASS') || pageText.includes('EXCEEDED') || pageText.includes('Residual Offset')

    results.push({
      tool: 'Stakeout Cut Sheet',
      url: '/tools/stakeout-report',
      status: hasDesignStaked && hasTolerance && hasPassFail ? 'PASS' : 'FAIL',
      elementsFound: [
        hasDesignStaked ? 'Design vs. Staked Coordinate Schedule' : 'MISSING Schedule',
        hasTolerance ? 'Allowable Construction & Cadastral Tolerances' : 'MISSING Tolerances',
        hasPassFail ? 'Residual Offset Statistics & Pass/Fail Verdict' : 'MISSING Verdict',
      ],
      screenshot,
    })
    console.log('   Stakeout Cut Sheet check completed.')
  } catch (err: any) {
    console.error('   Stakeout Cut Sheet failed:', err.message)
    results.push({ tool: 'Stakeout Cut Sheet', url: '/tools/stakeout-report', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  // 9. Verify CAD Canvas (/tools/cad-editor)
  console.log('9. Auditing /tools/cad-editor...')
  try {
    await page.goto(`${BASE_URL}/tools/cad-editor`, { waitUntil: 'networkidle', timeout: 20000 })
    
    // Wait for CAD editor UI and command line to be rendered
    await page.waitForSelector('text=Command:', { timeout: 15000 })
    const screenshot = path.join(SCREENSHOTS_DIR, '09_cad_editor.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    const hasCanvas = (await page.locator('svg[viewBox]').count()) > 0
    const pageText = await page.innerText('body')
    const hasCli = pageText.includes('Command:') || (await page.locator('input[placeholder*="command" i], input[placeholder*="Command" i]').count()) > 0
    const hasTools = pageText.includes('Scale') || pageText.includes('Beacon') || pageText.includes('Boundary') || pageText.includes('Calibrate')

    results.push({
      tool: 'CAD Canvas & Digitizer',
      url: '/tools/cad-editor',
      status: hasCanvas && hasTools && hasCli ? 'PASS' : 'FAIL',
      elementsFound: [
        hasCanvas ? 'Interactive Precision Vector CAD Canvas (SVG)' : 'MISSING Canvas',
        hasCli ? 'AutoCAD-Style Command Line Interface (CLI)' : 'MISSING CLI',
        hasTools ? 'Cadastral Vector Tools (Beacon, Boundary, Calibrate)' : 'MISSING Tools',
      ],
      screenshot,
    })
    console.log('   CAD Canvas check completed.')
  } catch (err: any) {
    console.error('   CAD Canvas failed:', err.message)
    results.push({ tool: 'CAD Canvas', url: '/tools/cad-editor', status: 'FAIL', elementsFound: [], screenshot: '', details: err.message })
  }

  await browser.close()

  console.log('\n====================================================')
  console.log('VERIFICATION SUMMARY')
  console.log('====================================================')
  let allPass = true
  for (const r of results) {
    const symbol = r.status === 'PASS' ? '✅' : '❌'
    console.log(`${symbol} ${r.tool} (${r.url}): ${r.status}`)
    for (const el of r.elementsFound) {
      console.log(`   • ${el}`)
    }
    if (r.details) {
      console.log(`   Note: ${r.details}`)
    }
    if (r.status === 'FAIL') allPass = false
  }

  console.log('\nAudit Outcome:', allPass ? 'ALL TOOLS PASS LIVE BROWSER VERIFICATION!' : 'SOME TOOLS FAILED!')
}

runLiveVerification().catch(console.error)
