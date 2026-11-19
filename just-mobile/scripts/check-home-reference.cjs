// Local visual QA against live public API data. No backend records are changed.
const { chromium } = require('../../just-front/node_modules/playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const output = path.resolve(__dirname, '../qa/home-reference');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    const session = {userId:"signed-in-home-qa", name:"QA Buyer", role:"buyer", token:"local-fixture", isDemo:false};
    await page.addInitScript(value => sessionStorage.setItem("jpi.buyer.session", JSON.stringify(value)), session);
    page.on('pageerror', error => errors.push(error.message));
    // Fresh public API snapshots avoid local-port CORS and flaky Node TLS.
    // They are test inputs only; the app still fetches its real API in builds.
    await page.route('https://just-pack-it-bq64.onrender.com/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/auth/me" || url.pathname === "/orders") {
        const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization" };
        if (route.request().method() === "OPTIONS") return route.fulfill({status:204, headers});
        return route.fulfill({json:url.pathname === "/auth/me" ? session : [], headers});
      }
      const file = url.searchParams.has('category') ? 'category-' + url.searchParams.get('category') : url.pathname.slice(1);
      await route.fulfill({ body: fs.readFileSync(path.join(output, file + '.json'), 'utf8'), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto(process.env.PREVIEW_URL || 'http://localhost:8084', { timeout: 60000 });
    await page.getByText('Good shops. Close by.', { exact: true }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    assert.equal(await page.getByText('Showing one category', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Vegetables & Fruits', exact: true }).count(), 1);
    for (const name of ['Grocery', 'Fashion', 'Dairy & Eggs', 'Electronics', 'Stationery', 'Beauty & Personal Care', 'More']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1);
    }
    await page.screenshot({ path: path.join(output, 'home-390-top.png') });
    await page.setViewportSize({ width: 390, height: 1658 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, 'home-390-full.png') });
    console.log('DEFAULT HOME:', await page.locator('body').innerText());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Vegetables & Fruits', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Home', exact: true }).waitFor();
    await page.getByText('No active products are available in this category', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'category-empty.png') });
    await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await page.getByText('Popular in Your\nNeighbourhood', { exact: true }).waitFor();
    assert.equal(await page.getByText('Showing one category', { exact: true }).count(), 0);
    await page.getByText('dog food', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Stationery', exact: true }).click();
    await page.getByRole('button', { name: 'View School Bag For Children', exact: true }).waitFor();
    await page.getByText('+ Add', { exact: true }).click();
    await page.getByRole('button', { name: 'View bag · 1 item', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'category-stationery.png') });
    await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByText('All categories', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close categories', exact: true }).click();
    await page.getByRole('button', { name: 'Explore shops', exact: true }).click();
    await page.getByText('Shops in Raiyam', { exact: true }).waitFor();
    await page.getByText('←', { exact: true }).first().click();
    await page.getByText('Good shops. Close by.', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('Buy Again', { exact: true }).scrollIntoViewIfNeeded();
    const buyAgain = await page.getByText('Buy Again', { exact: true }).boundingBox();
    const homeTab = await page.getByText('Home', { exact: true }).boundingBox();
    assert.ok(buyAgain.y + buyAgain.height < homeTab.y, 'Buy Again is not hidden by tabs');
    await page.screenshot({ path: path.join(output, 'home-390-bottom.png') });
    await page.getByText('Home', { exact: true }).click();
    await page.getByText('Change', { exact: true }).click();
    await page.getByText('Choose delivery area', { exact: true }).waitFor();
    await page.getByText('Raiyam', { exact: true }).last().click();
    await page.getByText('Good shops. Close by.', { exact: true }).waitFor();
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const hero = await page.getByTestId('home-hero').boundingBox();
      const cta = await page.getByRole('button', { name: 'Explore shops', exact: true }).boundingBox();
      assert.ok(cta.y >= hero.y && cta.y + cta.height <= hero.y + hero.height - 10,
        `Explore shops must fit completely inside the ${width}px banner`);
      await page.screenshot({ path: path.join(output, `home-${width}-top.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: default unfiltered Home, live products, intentional category filter, Home reset, More, shops, location, 360/390/430 widths; no runtime errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
