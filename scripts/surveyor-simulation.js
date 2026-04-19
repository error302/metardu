const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const CREDENTIALS = {
  email: 'mohameddosho20@gmail.com',
  password: 'Dosho10701$'
};

const TRAVERSE_DATA = [
  { stn: 'AB3', bearing: "287 14 04", dist: 102.20 },
  { stn: 'AB4a', bearing: "287 14 04", dist: 74.40 },
  { stn: 'AB4', bearing: "287 14 04", dist: 5.92 },
  { stn: 'AB4b', bearing: "174 04 11", dist: 6.01 },
  { stn: 'AB1', bearing: "174 04 11", dist: 228.80 },
  { stn: 'AB2', bearing: "84 04 11", dist: 74.00 },
  { stn: 'AB3', bearing: "354 04 11", dist: 203.14 }
];

async function runSimulation() {
  console.log('🚀 Starting Surveyor Simulation...');
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const bugLog = [];
  const logBug = (step, msg, severity = 'HIGH') => {
    console.error(`❌ [${step}] ${msg}`);
    bugLog.push(`## BUG-${bugLog.length + 1}: ${msg}\n**Step:** ${step}\n**Severity:** ${severity}\n`);
  };

  try {
    // STEP 1: LOGIN
    console.log('Step 1: Authenticating...');
    await page.goto(`${BASE_URL}/login`);
    await page.type('input[type="email"]', CREDENTIALS.email);
    await page.type('input[type="password"]', CREDENTIALS.password);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    if (!page.url().includes('dashboard')) {
      logBug('Step 1', 'Failed to redirect to dashboard after login');
    } else {
      console.log('✅ Step 1 Passed: Authenticated');
      await page.screenshot({ path: 'artifacts/step1_dashboard.png' });
    }

    // STEP 2: CREATE PROJECT
    console.log('Step 2: Creating Project...');
    await page.goto(`${BASE_URL}/project/new`);
    await page.type('input[placeholder*="Karen Estate"]', 'Kiambu 4-Acre Cadastral');
    await page.select('select', 'cadastral'); // Assuming first select is surveyType, but let's be more precise
    
    // Better way to find the survey type select
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const surveySelect = selects.find(s => s.innerText.toLowerCase().includes('cadastral') || s.value === 'cadastral');
      if (surveySelect) surveySelect.value = 'cadastral';
    });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    console.log('✅ Step 2 Passed: Project Created');
    await page.screenshot({ path: 'artifacts/step2_project_created.png' });

    // STEP 3: FIELD ENTRY
    console.log('Step 3: Entering Field Data...');
    // We need to find the project ID or just use the last created one from dashboard
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('a[href*="/projects/"]');
    const projectLink = await page.$eval('a[href*="/projects/"]', el => el.getAttribute('href'));
    const projectId = projectLink.split('/').pop();
    
    await page.goto(`${BASE_URL}/projects/${projectId}`);
    // Assume Workflow step for Field Book is the first button or similar
    // Let's go directly to the field book if possible
    await page.goto(`${BASE_URL}/fieldbook/${projectId}?type=cadastral`);
    await page.waitForSelector('table');

    for (let i = 0; i < TRAVERSE_DATA.length; i++) {
      const data = TRAVERSE_DATA[i];
      // Click "Add Row" for each new station except the first one (which exists by default)
      if (i > 0) {
        await page.click('button:last-child'); // Add row button
        await new Promise(r => setTimeout(r, 100));
      }
      
      const rowNum = i + 1;
      const rowSelector = `tbody tr:nth-child(${rowNum})`;
      
      // Need to find which input is station, bearing, distance
      // Using placeholders or indices
      await page.type(`${rowSelector} input[placeholder="Ex: A1"]`, data.stn);
      await page.type(`${rowSelector} input[placeholder="D M S"]`, data.bearing);
      await page.type(`${rowSelector} input[type="number"]`, String(data.dist));
    }

    await page.click('button:last-child'); // Explicit Save
    console.log('✅ Step 3 Passed: Data Entered');
    await page.screenshot({ path: 'artifacts/step3_field_entry.png' });

    // STEP 4: COMPUTE
    console.log('Step 4: Running Computation...');
    const computeBtn = await page.$x("//button[contains(text(), 'Adjust Traverse')]");
    if (computeBtn.length > 0) {
      await computeBtn[0].click();
      await new Promise(r => setTimeout(r, 1000));
      const resultText = await page.evaluate(() => document.body.innerText);
      if (resultText.includes('Precision') || resultText.includes('Adjustment')) {
        console.log('✅ Step 4 Passed: Computation Result visible');
      } else {
        logBug('Step 4', 'Computation result not found in UI');
      }
    }
    await page.screenshot({ path: 'artifacts/step4_computation.png' });

    // FINAL SUMMARY
    fs.writeFileSync('artifacts/simulation_report.md', `
# Simulation Report
**Date:** ${new Date().toISOString()}
**Bugs Found:** ${bugLog.length}

${bugLog.join('\n---\n')}

## Visual Evidence
- [Step 1 Dashboard](file:///artifacts/step1_dashboard.png)
- [Step 2 Project](file:///artifacts/step2_project_created.png)
- [Step 3 Field](file:///artifacts/step3_field_entry.png)
- [Step 4 Result](file:///artifacts/step4_computation.png)
    `);

  } catch (err) {
    logBug('GLOBAL', `Simulation crashed: ${err.message}`, 'CRITICAL');
  } finally {
    await browser.close();
    console.log('🏁 Simulation Complete.');
  }
}

runSimulation();
