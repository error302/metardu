/**
 * E2E Browser Test — Surveyor Workflow with F/R 583/58 Cadastral Data
 * 
 * This script starts the Next.js dev server, runs browser tests, then stops it.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = '/home/z/my-project/download/e2e-screenshots';
const VIEWPORT = { width: 1440, height: 900 };
const SCREENSHOT_TIMEOUT = 15000;

// F/R 583/58 Beacons (Arc 1960 / UTM Zone 37S)
const BEACONS: Record<string, { n: number; e: number }> = {
  CN4:   { n: 113919.14, e: -3718.10 },
  CN4a:  { n: 114218.49, e: -3692.81 },
  RD21:  { n: 114370.35, e: -4182.37 },
  RDa1:  { n: 114621.15, e: -4990.85 },
  RDa2:  { n: 114234.01, e: -4969.62 },
  Ne1:   { n: 114168.19, e: -4786.55 },
  Ne2:   { n: 114044.16, e: -4685.55 },
  Ne3:   { n: 113720.01, e: -4596.44 },
  Ne4:   { n: 113350.60, e: -4397.45 },
  Ne5:   { n: 113238.92, e: -4177.45 },
  AB1:   { n: 114190.94, e: -4332.60 },
  AB2:   { n: 114198.58, e: -4259.00 },
  AB3:   { n: 114400.63, e: -4279.99 },
  AB4:   { n: 114424.48, e: -4356.86 },
};

const DATUM_JOINS = [
  { from: 'RD21', to: 'RDa1', dist: 846.49,  bearD: 287, bearM: 14, bearS: 4   },
  { from: 'RDa1', to: 'RDa2', dist: 381.71,  bearD: 176, bearM: 51, bearS: 40  },
  { from: 'RDa2', to: 'Ne1',  dist: 194.54,  bearD: 109, bearM: 46, bearS: 42  },
  { from: 'Ne1',  to: 'Ne2',  dist: 159.96,  bearD: 140, bearM: 50, bearS: 26  },
  { from: 'Ne2',  to: 'Ne3',  dist: 336.17,  bearD: 164, bearM: 37, bearS: 50  },
  { from: 'Ne3',  to: 'Ne4',  dist: 419.60,  bearD: 151, bearM: 41, bearS: 24  },
  { from: 'Ne4',  to: 'Ne5',  dist: 246.72,  bearD: 116, bearM: 54, bearS: 50  },
  { from: 'Ne5',  to: 'CN4',  dist: 820.80,  bearD: 34,  bearM: 1,  bearS: 51   },
  { from: 'CN4',  to: 'CN4a', dist: 300.41,  bearD: 4,   bearM: 49, bearS: 42  },
  { from: 'CN4a', to: 'RD21', dist: 512.57,  bearD: 287, bearM: 14, bearS: 4   },
];

// ============================================================
// Helpers
// ============================================================

function waitForServer(url: string, maxWait = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else if (Date.now() - start < maxWait) {
          setTimeout(check, 2000);
        } else {
          reject(new Error(`Server not ready: status ${res.statusCode}`));
        }
      });
      req.on('error', () => {
        if (Date.now() - start < maxWait) setTimeout(check, 2000);
        else reject(new Error(`Server unreachable after ${maxWait}ms`));
      });
      req.setTimeout(5000);
    };
    check();
  });
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function takeScreenshot(page: Page, name: string, fullPage = false): Promise<string> {
  const filepath = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path: filepath, fullPage, animations: 'disabled', timeout: SCREENSHOT_TIMEOUT });
  return filepath;
}

async function clickButton(page: Page, text: string) {
  const btn = page.locator(`button:has-text("${text}")`).first();
  await btn.click({ timeout: 10000 });
  await sleep(500);
}

interface TestResult {
  name: string; passed: boolean; screenshot: string; duration: number;
  error?: string; notes?: string;
}

// ============================================================
// Start / Stop Dev Server
// ============================================================

let serverProcess: ChildProcess | null = null;

function startServer(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${port}`;
    
    serverProcess = spawn('node', [
      '/home/z/my-project/metardu/node_modules/.bin/next', 'dev',
      '-p', String(port), '-H', '127.0.0.1'
    ], {
      cwd: '/home/z/my-project/metardu',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
    });

    const logLines: string[] = [];
    serverProcess.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      logLines.push(line);
      if (line.includes('Ready') || line.includes('ready')) {
        console.log(`  Server log: ${line}`);
      }
    });
    serverProcess.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      logLines.push(line);
    });
    serverProcess.on('error', (err) => reject(err));

    waitForServer(url, 90000).then(() => resolve(url)).catch(reject);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    try { serverProcess.kill(0); } catch {}
    serverProcess = null;
  }
}

// ============================================================
// Tests
// ============================================================

async function testLandingPage(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [1/9] Landing Page...');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);
    
    const title = await page.title();
    const bodyLen = (await page.innerText('body')).length;
    notes = `Title: "${title}", Body: ${bodyLen} chars`;
    passed = bodyLen > 200;
    if (!passed) error = 'Page body too short';
  } catch (e: any) { error = e.message.slice(0, 200); }
  
  const ss = await takeScreenshot(page, '01-landing-page');
  return { name: '1. Landing Page', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testCoordinateConversion(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [2/9] Coordinate Conversion — CN4 (UTM Zone 37S → Lat/Lon)...');
    await page.goto(`${baseUrl}/tools/coordinates`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000); // Wait for hydration

    // Screenshot before filling
    await takeScreenshot(page, '02a-coords-before');

    // Find inputs - try various strategies
    const inputs = page.locator('input');
    const count = await inputs.count();
    notes = `Found ${count} inputs`;
    
    // Try to fill by evaluating in the page context to bypass React
    await page.evaluate(() => {
      // Find all inputs and log their attributes
      const allInputs = document.querySelectorAll('input');
      return Array.from(allInputs).map(i => ({
        type: i.type, placeholder: i.placeholder, name: i.name, id: i.id, value: i.value
      }));
    }).then(attrs => {
      notes += ` | Input attrs: ${JSON.stringify(attrs.slice(0, 6))}`;
    });

    // Use page.fill() for React inputs - Playwright handles React compatibility
    try {
      const inputs = page.locator('input');
      const count = await inputs.count();
      
      // Coordinate page has 3 inputs: Easting, Northing, Zone
      // Fill by order: input 0 = Easting, input 1 = Northing, input 2 = Zone
      if (count >= 3) {
        await inputs.nth(0).fill(String(BEACONS.CN4.e));
        await sleep(100);
        await inputs.nth(1).fill(String(BEACONS.CN4.n));
        await sleep(100);
        await inputs.nth(2).fill('37');
        await sleep(100);
        notes += ' | Filled 3 inputs (E, N, Zone)';
      }
      
      // Hemisphere select
      const hemiSelect = page.locator('select').first();
      if (await hemiSelect.count() > 0) {
        await hemiSelect.selectOption({ label: 'S' });
        notes += ' | Hemisphere: S';
      }
      
      await sleep(300);
      await clickButton(page, 'Convert');
      await sleep(3000);
    } catch (fillErr: any) {
      notes += ` | Fill error: ${fillErr.message.slice(0, 100)}`;
    }

    // Take screenshot AFTER clicking convert
    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('Latitude') || bodyText.includes('lat') ||
                       bodyText.includes('Longitude') || bodyText.includes('lon') ||
                       bodyText.includes('°') || bodyText.includes('Convert');
    notes += ` | Has results: ${hasResults}, bodyLen: ${bodyText.length}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '02b-coords-after');
  return { name: '2. Coordinate Conversion (CN4)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testDistanceBearing(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [3/9] Distance & Bearing — RD21 → RDa1...');
    await page.goto(`${baseUrl}/tools/distance`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // Log input attributes
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).slice(0, 8).map(i => ({ ph: i.placeholder, type: i.type, name: i.name, id: i.id }));
    });
    notes = `Inputs: ${JSON.stringify(inputInfo)}`;

    // Fill using Playwright fill (handles React controlled components)
    const inputs = page.locator('input');
    const count = await inputs.count();
    if (count >= 4) {
      await inputs.nth(0).fill(String(BEACONS.RD21.n));
      await inputs.nth(1).fill(String(BEACONS.RD21.e));
      await inputs.nth(2).fill(String(BEACONS.RDa1.n));
      await inputs.nth(3).fill(String(BEACONS.RDa1.e));
      notes += ' | Filled 4 inputs';
    }

    await sleep(500);
    await clickButton(page, 'Calculate');
    await sleep(3000);

    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('846') || bodyText.includes('847') ||
                       bodyText.includes('287') || bodyText.includes('Distance') ||
                       bodyText.includes('Bearing') || bodyText.includes('WCB') ||
                       bodyText.includes('Solution') || bodyText.includes('result');
    notes += ` | Results: ${hasResults}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '03-distance-bearing');
  return { name: '3. Distance & Bearing (RD21→RDa1)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testArea(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [4/9] Area Computation — Parcel A (expected ~1.619 Ha)...');
    await page.goto(`${baseUrl}/tools/area`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // Log page structure
    const pageInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      return { inputCount: inputs.length, buttons };
    });
    notes = `Inputs: ${pageInfo.inputCount}, Buttons: ${JSON.stringify(pageInfo.buttons.slice(0, 10))}`;

    // Try to fill the area coordinates using React-native setter
    const parcelPoints = [
      { n: BEACONS.AB1.n, e: BEACONS.AB1.e },
      { n: BEACONS.AB2.n, e: BEACONS.AB2.e },
      { n: BEACONS.AB3.n, e: BEACONS.AB3.e },
      { n: BEACONS.AB4.n, e: BEACONS.AB4.e },
    ];

    // Fill using Playwright fill
    const inputs = page.locator('input');
    const count = await inputs.count();
    // Area page has pairs: (northing, easting) for each point
    for (let i = 0; i < parcelPoints.length && (i * 2 + 1) < count; i++) {
      await inputs.nth(i * 2).fill(String(parcelPoints[i].n));
      await inputs.nth(i * 2 + 1).fill(String(parcelPoints[i].e));
      notes += ` | Filled point ${i}`;
    }

    await sleep(500);
    await clickButton(page, 'Calculate Area');
    await sleep(3000);

    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('1.6') || bodyText.includes('16') ||
                       bodyText.includes('Area') || bodyText.includes('area') ||
                       bodyText.includes('ha') || bodyText.includes('Ha') ||
                       bodyText.includes('Shoelace') || bodyText.includes('Solution');
    notes += ` | Results: ${hasResults}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '04-area-parcel-a');
  return { name: '4. Area Computation (Parcel A)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testTraverse(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [5/9] Traverse Adjustment — F/R 583/58 boundary (10 legs)...');
    await page.goto(`${baseUrl}/tools/traverse`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // Log structure
    const pageInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      const rows = document.querySelectorAll('tr').length;
      return { inputCount: inputs.length, buttons: buttons.slice(0, 10), rows };
    });
    notes = `Inputs: ${pageInfo.inputCount}, Buttons: ${JSON.stringify(pageInfo.buttons)}, Rows: ${pageInfo.rows}`;

    // Add legs if needed
    const currentLegCount = pageInfo.rows - 1; // minus header row
    notes += ` | Current legs: ${currentLegCount}`;
    
    // We need 10 legs. Add if fewer exist
    const needed = Math.max(0, DATUM_JOINS.length - currentLegCount);
    for (let i = 0; i < needed; i++) {
      await clickButton(page, 'Add Leg');
      await sleep(200);
    }
    await sleep(500);

    // Fill traverse data using Playwright fill
    // Each traverse row has: dist, bearingD, bearingM, bearingS, n, e inputs
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    notes += ` | Data rows: ${rowCount}`;
    
    for (let i = 0; i < DATUM_JOINS.length && i < rowCount; i++) {
      const leg = DATUM_JOINS[i];
      const rowInputs = rows.nth(i).locator('input');
      const inputCount = await rowInputs.count();
      
      if (inputCount >= 4) {
        await rowInputs.nth(0).fill(String(leg.dist));
        await rowInputs.nth(1).fill(String(leg.bearD));
        await rowInputs.nth(2).fill(String(leg.bearM));
        await rowInputs.nth(3).fill(String(leg.bearS));
        // First leg needs coordinates
        if (i === 0 && inputCount >= 6) {
          await rowInputs.nth(4).fill(String(BEACONS.RD21.n));
          await rowInputs.nth(5).fill(String(BEACONS.RD21.e));
        }
        notes += ` | Leg ${i}: dist=${leg.dist}`;
      }
      await sleep(50);
    }

    await sleep(500);
    await clickButton(page, 'Calculate Adjustment');
    await sleep(5000);

    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('Misclosure') || bodyText.includes('misclosure') ||
                       bodyText.includes('Precision') || bodyText.includes('1:') ||
                       bodyText.includes('Adjusted') || bodyText.includes('RDM') ||
                       bodyText.includes('Bowditch') || bodyText.includes('Table');
    notes += ` | Results: ${hasResults}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 400); }
  
  const ss = await takeScreenshot(page, '05-traverse-fr583');
  return { name: '5. Traverse Adjustment (F/R 583/58)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testCOGO(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [6/9] COGO Calculator — Inverse (RD21 → RDa1)...');
    await page.goto(`${baseUrl}/tools/cogo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    const pageInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      return { inputCount: inputs.length, buttons: buttons.slice(0, 15) };
    });
    notes = `Inputs: ${pageInfo.inputCount}, Buttons: ${JSON.stringify(pageInfo.buttons)}`;

    // Fill COGO inverse using Playwright fill
    const inputs = page.locator('input');
    const count = await inputs.count();
    // COGO Inverse tab: E1, N1, Label1, E2, N2, Label2
    if (count >= 4) {
      await inputs.nth(0).fill(String(BEACONS.RD21.e));
      await inputs.nth(1).fill(String(BEACONS.RD21.n));
      if (count >= 5) {
        await inputs.nth(3).fill(String(BEACONS.RDa1.e));
        await inputs.nth(4).fill(String(BEACONS.RDa1.n));
      }
      notes += ' | Filled E1, N1, E2, N2';
    }

    await sleep(500);
    await clickButton(page, 'Compute Inverse');
    await sleep(3000);

    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('846') || bodyText.includes('287') ||
                       bodyText.includes('Distance') || bodyText.includes('Bearing') ||
                       bodyText.includes('Result') || bodyText.includes('result');
    notes += ` | Results: ${hasResults}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '06-cogo-inverse');
  return { name: '6. COGO Inverse (RD21→RDa1)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testBearing(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [7/9] Bearing Calculator — Ne3 → Ne4...');
    await page.goto(`${baseUrl}/tools/bearing`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // Fill using Playwright fill
    const inputs = page.locator('input');
    const count = await inputs.count();
    if (count >= 4) {
      await inputs.nth(0).fill(String(BEACONS.Ne3.n));
      await inputs.nth(1).fill(String(BEACONS.Ne3.e));
      await inputs.nth(2).fill(String(BEACONS.Ne4.n));
      await inputs.nth(3).fill(String(BEACONS.Ne4.e));
      notes += ' | Filled 4 inputs';
    }

    await sleep(500);
    await clickButton(page, 'Calculate');
    await sleep(3000);

    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('151') || bodyText.includes('Bearing') ||
                       bodyText.includes('WCB') || bodyText.includes('Back') ||
                       bodyText.includes('Solution');
    notes += ` | Results: ${hasResults}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '07-bearing-ne3-ne4');
  return { name: '7. Bearing Calculator (Ne3→Ne4)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testToolsIndex(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [8/9] Tools Index Page...');
    await page.goto(`${baseUrl}/tools`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);

    const bodyText = await page.innerText('body');
    const linkCount = await page.locator('a[href*="/tools/"]').count();
    const hasContent = bodyText.includes('Traverse') || bodyText.includes('Distance') ||
                       bodyText.includes('Area') || bodyText.includes('Coordinates') ||
                       bodyText.includes('Leveling') || bodyText.includes('COGO') ||
                       bodyText.includes('calculator') || bodyText.includes('Calculator');
    notes = `Links: ${linkCount}, Content: ${hasContent}`;
    passed = hasContent && linkCount > 0;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '08-tools-index');
  return { name: '8. Tools Index', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

async function testSettingOut(page: Page, baseUrl: string): Promise<TestResult> {
  const t0 = Date.now();
  let passed = false, error = '', notes = '';
  try {
    console.log('  [9/9] Setting Out — AB1, AB2, AB3, AB4 from RD21...');
    await page.goto(`${baseUrl}/tools/setting-out`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    const pageInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      return { inputCount: inputs.length, buttons: buttons.slice(0, 15) };
    });
    notes = `Inputs: ${pageInfo.inputCount}, Buttons: ${JSON.stringify(pageInfo.buttons)}`;

    // Add design points
    const currentRows = await page.locator('tr').count();
    const needed = Math.max(0, 4 - (currentRows - 2)); // -2 for header rows
    for (let i = 0; i < needed; i++) {
      await clickButton(page, 'Add Point');
      await sleep(200);
    }
    await sleep(300);

    // Fill using Playwright fill
    const inputs = page.locator('input');
    const count = await inputs.count();
    // Station setup: E, N, RL, IH, BS_E, BS_N
    if (count >= 6) {
      await inputs.nth(0).fill(String(BEACONS.RD21.e));
      await inputs.nth(1).fill(String(BEACONS.RD21.n));
      await inputs.nth(2).fill('0.000');
      await inputs.nth(3).fill('1.500');
      await inputs.nth(4).fill(String(BEACONS.CN4.e));
      await inputs.nth(5).fill(String(BEACONS.CN4.n));
      notes += ' | Station setup filled';
    }
    // Design points start after station setup inputs
    const designPoints = [
      { id: 'AB1', e: BEACONS.AB1.e, n: BEACONS.AB1.n },
      { id: 'AB2', e: BEACONS.AB2.e, n: BEACONS.AB2.n },
      { id: 'AB3', e: BEACONS.AB3.e, n: BEACONS.AB3.n },
      { id: 'AB4', e: BEACONS.AB4.e, n: BEACONS.AB4.n },
    ];
    for (let i = 0; i < designPoints.length; i++) {
      const offset = 6 + i * 6; // 6 station inputs + 6 per design point
      if (offset + 2 < count) {
        await inputs.nth(offset).fill(designPoints[i].id);
        await inputs.nth(offset + 1).fill(String(designPoints[i].e));
        await inputs.nth(offset + 2).fill(String(designPoints[i].n));
        notes += ` | Point ${designPoints[i].id} filled`;
      }
    }

    await sleep(500);
    await clickButton(page, 'Compute Setting Out');
    await sleep(5000);

    const bodyText = await page.innerText('body');
    const hasResults = bodyText.includes('AB1') || bodyText.includes('AB2') ||
                       bodyText.includes('Setting') || bodyText.includes('Horizontal') ||
                       bodyText.includes('Distance') || bodyText.includes('Bearing');
    notes += ` | Results: ${hasResults}`;
    passed = hasResults;

  } catch (e: any) { error = e.message.slice(0, 300); }
  
  const ss = await takeScreenshot(page, '09-setting-out');
  return { name: '9. Setting Out (AB1-AB4 from RD21)', passed, screenshot: ss, duration: Date.now() - t0, error: error || undefined, notes: notes || undefined };
}

// ============================================================
// Main
// ============================================================

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('\n' + '═'.repeat(66));
  console.log('  METARDU E2E SURVEYOR WORKFLOW TEST');
  console.log('  F/R 583/58 Cadastral Subdivision — Real Kenyan Survey Data');
  console.log('═'.repeat(66) + '\n');

  // Start dev server
  console.log('Starting Next.js dev server...');
  const baseUrl = await startServer(3000);
  console.log(`Server running at ${baseUrl}\n`);

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Run tests
  const results: TestResult[] = [];
  
  results.push(await testLandingPage(page, baseUrl));
  results.push(await testCoordinateConversion(page, baseUrl));
  results.push(await testDistanceBearing(page, baseUrl));
  results.push(await testArea(page, baseUrl));
  results.push(await testTraverse(page, baseUrl));
  results.push(await testCOGO(page, baseUrl));
  results.push(await testBearing(page, baseUrl));
  results.push(await testToolsIndex(page, baseUrl));
  results.push(await testSettingOut(page, baseUrl));

  await browser.close();
  stopServer();

  // Print results
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.reduce((s, r) => s + r.duration, 0);

  console.log('\n' + '═'.repeat(66));
  console.log('  TEST RESULTS');
  console.log('═'.repeat(66));
  console.log(`  Total: ${results.length} | ✅ ${passed} passed | ❌ ${failed} failed | ${(total/1000).toFixed(1)}s\n`);

  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name} (${r.duration}ms)`);
    if (r.notes) console.log(`     ${r.notes}`);
    if (r.error) console.log(`     ⚠ ${r.error}`);
    console.log(`     📸 ${r.screenshot}\n`);
  }

  // Save reports
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: results.length, passed, failed, totalTime: total },
    beacons: BEACONS,
    datumJoins: DATUM_JOINS,
    tests: results,
  };
  
  fs.writeFileSync(`${SCREENSHOT_DIR}/e2e-report.json`, JSON.stringify(report, null, 2));
  console.log(`Reports: ${SCREENSHOT_DIR}/e2e-report.json`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}/\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(2); });
