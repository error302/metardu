const { chromium } = require('playwright');

async function testLogin() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'mohameddosho20@gmail.com');
  await page.fill('input[type="password"]', 'Dosho10701$');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(3000);
  console.log('Current URL after submit:', page.url());
  const errorEl = await page.locator('.text-red-500, .text-red-400, [role="alert"]').allInnerTexts();
  console.log('Error elements found:', errorEl);
  await browser.close();
}

testLogin().catch(e => {
  console.error('Login error:', e);
  process.exit(1);
});
