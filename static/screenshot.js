const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  await page.goto('file:///Users/leodennis/MODULARIZED_XRAG/static/scrollbar_test.html');
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
})();
