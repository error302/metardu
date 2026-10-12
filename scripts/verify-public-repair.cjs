const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({headless: true, channel: 'msedge'});
  const page = await browser.newPage();
  const results = [];
  for (const route of ['/', '/pricing', '/tools', '/login', '/api/public/health']) {
    const errors = [];
    const onError = error => errors.push(error.message);
    page.on('pageerror', onError);
    try {
      const response = await page.goto(`${process.argv[2] || 'https://metardu.space'}${route}`, {waitUntil:'domcontentloaded', timeout:30000});
      await page.waitForLoadState('networkidle', {timeout:5000}).catch(()=>{});
      const html = await response.text();
      results.push({route, status:response.status(), title:await page.title(), text:(await page.locator('body').innerText()).slice(0,500), edgeRewrites: html.match(/.{0,100}(?:data-cfemail|__cf_email__|email-decode|rocket-loader).{0,100}/g), errors});
    } catch(error) { results.push({route,error:error.message}); }
    page.off('pageerror',onError);
  }
  fs.writeFileSync(`live-test-results/repair-${process.argv[2] ? 'local' : 'public'}-check.json`, JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
})().catch(e=>{console.error(e.message); process.exitCode=1;});
