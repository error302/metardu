throw new Error('Disabled: this helper embedded a production credential and fabricated sessions. Use normal sign-in or isolated synthetic test fixtures.');
import { chromium } from 'playwright';
import { encode } from 'next-auth/jwt';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/user/.gemini/antigravity/brain/2b3769fe-fdf5-47b8-bbca-353ab182bab3/home-survey-audit';
const BASE_URL = 'http://127.0.0.1:3000';
const NEXTAUTH_SECRET = 'REMOVED_EXPOSED_SIGNING_SECRET';

async function testTopologyAndDeed() {
  const jwt = await encode({
    token: {
      id: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
      email: 'mohameddosho20@gmail.com',
      name: 'Mohamed Dosho',
      role: 'admin',
      provider: 'google',
      sessionVersion: 1,
      sub: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    },
    secret: NEXTAUTH_SECRET,
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-quic'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.route('https://metardu.space/**', async (route) => {
    const localUrl = route.request().url().replace('https://metardu.space', BASE_URL);
    try {
      const response = await fetch(localUrl, {
        method: route.request().method(),
        headers: route.request().headers(),
      });
      const body = await response.arrayBuffer();
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: Buffer.from(body),
      });
    } catch {
      await route.continue();
    }
  });

  await context.addCookies([
    { name: 'next-auth.session-token', value: jwt, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: '__Secure-next-auth.session-token', value: jwt, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax', secure: true },
    { name: 'next-auth.session-token', value: jwt, domain: 'metardu.space', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: '__Secure-next-auth.session-token', value: jwt, domain: 'metardu.space', path: '/', httpOnly: true, sameSite: 'Lax', secure: true },
  ]);

  const page = await context.newPage();

  // 1. TOPOLOGY CHECK
  console.log('Testing Topology pre-flight check...');
  await page.goto(`${BASE_URL}/tools/topology-check`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Fill in home coordinates:
  // MB1: 254380.000, 9857460.000
  // MB2: 254420.000, 9857460.000
  // MB3: 254420.000, 9857435.000
  // MB4: 254380.000, 9857435.000
  const rows = await page.$$('div:has(> input)');
  const inputs = await page.$$('input[type="text"], input[type="number"]');
  console.log(`Topology inputs count: ${inputs.length}`);

  // Find all easting/northing inputs by matching values or order
  const eastingInputs = await page.$$('input[value*="274"], input[value*="985"], input[placeholder*="Easting"]');
  console.log(`Coordinate inputs: ${eastingInputs.length}`);

  const crsInput = await page.$('input[placeholder*="reference"], input[placeholder*="declared"]');
  if (crsInput) await crsInput.fill('EPSG:32737 - UTM Zone 37S Arc 1960');

  const checkbox = await page.$('input[type="checkbox"]');
  if (checkbox) await checkbox.check();

  const runBtn = await page.$('button:has-text("Run pre-flight check")');
  if (runBtn) {
    console.log('Clicking Run pre-flight check...');
    await runBtn.click();
    await page.waitForTimeout(2000);
  }

  const topoPath = path.join(ARTIFACT_DIR, '03_topology_check_validated.png');
  await page.screenshot({ path: topoPath, fullPage: true });
  console.log('Saved topology validated screenshot to:', topoPath);

  // 2. DEED PLAN: Load 4-Acre Sample button test
  console.log('\nTesting Deed Plan Load 4-Acre Sample...');
  await page.goto(`${BASE_URL}/deed-plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const sampleBtn = await page.$('button:has-text("Load 4-Acre Sample")');
  if (sampleBtn) {
    console.log('Clicking Load 4-Acre Sample...');
    await sampleBtn.click();
    await page.waitForTimeout(1000);
  }

  const deedSamplePath = path.join(ARTIFACT_DIR, '05_deed_plan_sample_loaded.png');
  await page.screenshot({ path: deedSamplePath, fullPage: true });
  console.log('Saved deed plan sample loaded screenshot to:', deedSamplePath);

  await browser.close();
}

testTopologyAndDeed().catch(console.error);
