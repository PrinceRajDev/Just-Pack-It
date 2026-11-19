const { chromium } = require("../../just-front/node_modules/playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const output = path.resolve(__dirname, "../qa/guest-home");
  const snapshot = path.resolve(__dirname, "../qa/home-reference");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://just-pack-it-bq64.onrender.com/**", async route => {
      const url = new URL(route.request().url());
      const resource = url.pathname.slice(1);
      if (resource.startsWith("auth/")) return route.abort();
      let records = JSON.parse(fs.readFileSync(path.join(snapshot, resource + ".json"), "utf8"));
      const category = url.searchParams.get("category");
      const query = url.searchParams.get("q")?.toLowerCase();
      if (category) records = records.filter(item => item.categorySlug === category);
      if (query) records = records.filter(item => item.name.toLowerCase().includes(query));
      await route.fulfill({ json: records, headers: { "access-control-allow-origin": "*" } });
    });
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8084", { timeout: 60000 });
    await page.getByText("Shop by category", { exact: true }).waitFor();
    await page.addStyleTag({content:'[data-testid="buyer-shell"]{padding-top:28px!important;padding-bottom:20px!important}'});
    for (const [width,height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(300);
      const tiles = await Promise.all(["Groceries","Vegetables","Fruits","Dairy","Bakery","Personal care","Home care","Snacks"].map(name => page.getByRole("button",{name,exact:true}).boundingBox()));
      assert.ok(tiles.every(tile => tile && tile.x >= 0 && tile.x + tile.width <= width));
      assert.equal(new Set(tiles.map(tile => Math.round(tile.y))).size,2);
      await page.screenshot({path:path.join(output,`guest-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"Change delivery area"}).click();
    await page.getByText("Choose delivery area",{exact:true}).waitFor();
    await page.getByText("Raiyam",{exact:true}).last().click();
    for (const name of ["Groceries","Vegetables","Fruits","Dairy","Bakery","Personal care","Home care","Snacks"]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByText("No active products are available in this category",{exact:true}).waitFor();
      await page.getByRole("button",{name:"Back to Home"}).click();
    }
    await page.getByRole("button",{name:"More →",exact:true}).click();
    await page.getByText("All categories",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Close categories"}).click();
    for (const name of ["Explore nearby shops","See all"]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByText("Shops in Raiyam",{exact:true}).waitFor();
      await page.getByText("←",{exact:true}).first().click();
    }
    await page.getByRole("button",{name:"Search products, shops & brands"}).click();
    await page.getByRole("textbox",{name:"Search products, shops and brands"}).fill("dog");
    await page.getByRole("button",{name:"View dog food",exact:true}).waitFor();
    for (const [tab,heading] of [["Bag","Your bag is empty"],["Orders","Sign in to view orders"],["Account","Sign in to shop"],["Browse","Find your everyday."],["Home","Shop by category"]]) {
      await page.getByText(tab,{exact:true}).click();
      await page.getByText(heading,{exact:true}).waitFor();
    }
    await page.getByLabel("Notifications",{exact:true}).click();
    await page.getByText("Notifications",{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log("Guest Home visuals and navigation passed at four sizes.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
