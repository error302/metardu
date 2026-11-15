import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:3000/map', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  
  const toolsBtn = await page.$('.map-mobile-tools-toggle');
  if (toolsBtn) {
    await toolsBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'mobile_map_tools_open.png' });
    console.log('Saved mobile_map_tools_open.png');
  }

  const catBtn = await page.$('#map-mobile-tool-groups button');
  if (catBtn) {
    await catBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'mobile_map_cat_open.png' });
    console.log('Saved mobile_map_cat_open.png');
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
