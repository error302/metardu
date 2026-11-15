throw new Error('Disabled: this helper embedded a production credential and fabricated sessions. Use normal sign-in or isolated synthetic test fixtures.');
import { chromium } from 'playwright';
import { encode } from 'next-auth/jwt';

const secret = 'REMOVED_EXPOSED_SIGNING_SECRET';
const BASE_URL = 'http://127.0.0.1:3000';

async function testAuthNavigation() {
  const token = {
    id: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
    email: 'mohameddosho20@gmail.com',
    name: 'Mohamed Dosho',
    sessionVersion: 1,
    role: 'admin',
    provider: 'google',
    sub: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };

  const jwt = await encode({ token, secret });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-quic'],
  });

  const context = await browser.newContext();

  // Intercept metardu.space requests to 127.0.0.1:3000
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

  // Set the NextAuth session token cookie for both localhost and 127.0.0.1
  await context.addCookies([
    {
      name: 'next-auth.session-token',
      value: jwt,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: '__Secure-next-auth.session-token',
      value: jwt,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: true,
    },
    {
      name: 'next-auth.session-token',
      value: jwt,
      domain: 'metardu.space',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: '__Secure-next-auth.session-token',
      value: jwt,
      domain: 'metardu.space',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: true,
    },
  ]);

  const page = await context.newPage();

  console.log('Testing /deed-plan while authenticated as Mohamed Dosho...');
  await page.goto(`${BASE_URL}/deed-plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Current URL:', page.url());
  const deedPlanHeader = await page.$eval('h1, h2', (el) => el.textContent).catch(() => 'NOT FOUND');
  console.log('Page Header:', deedPlanHeader);

  console.log('Testing /tools/survey-report-builder...');
  await page.goto(`${BASE_URL}/tools/survey-report-builder`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Current URL:', page.url());
  const reportHeader = await page.$eval('h1, h2', (el) => el.textContent).catch(() => 'NOT FOUND');
  console.log('Report Header:', reportHeader);

  await browser.close();
}

testAuthNavigation().catch(console.error);
