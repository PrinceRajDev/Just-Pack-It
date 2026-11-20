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
    let releaseStartup;
    const startup = new Promise(resolve => { releaseStartup = resolve; });
    await page.route("https://just-pack-it-bq64.onrender.com/**", async route => {
      const url = new URL(route.request().url());
      const resource = url.pathname.slice(1);
      if (resource === "areas") await startup;
      if (resource.startsWith("auth/")) return route.abort();
      let records = JSON.parse(fs.readFileSync(path.join(snapshot, resource + ".json"), "utf8"));
      const category = url.searchParams.get("category");
      const query = url.searchParams.get("q")?.toLowerCase();
      if (category) records = records.filter(item => item.categorySlug === category);
      if (query) records = records.filter(item => item.name.toLowerCase().includes(query));
      await route.fulfill({ json: records, headers: { "access-control-allow-origin": "*" } });
    });
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8084", { timeout: 60000 });
    const loader = page.getByRole("heading", {name:"Loading JustPackIt…",exact:true});
    await loader.waitFor();
    assert.equal(await page.getByText("Loading Raiyam",{exact:true}).count(),0);
    releaseStartup();
    await loader.waitFor({state:"hidden"});
    await page.getByText("Shop by category", { exact: true }).waitFor();
    await page.getByRole("heading", {name:"Your neighbourhood, delivered."}).waitFor();
    await page.waitForFunction(() => {
      const photo = document.querySelector('[data-testid="home-hero-photo"] img');
      return photo && photo.complete && photo.naturalWidth > 0;
    });
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
    const selectedArea = page.getByRole("radio",{name:"Raiyam",exact:true});
    assert.equal(await selectedArea.getAttribute("aria-checked"),"true");
    await selectedArea.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="delivery-area-sheet"]')?.getBoundingClientRect().bottom <= innerHeight + 1);
    await page.screenshot({path:path.join(output,"delivery-area-390.png")});
    await selectedArea.click();
    await page.getByTestId("delivery-area-sheet").waitFor({state:"hidden"});
    for (const name of ["Groceries","Vegetables","Fruits","Dairy","Bakery","Personal care","Home care","Snacks"]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByText("No active products are available in this category",{exact:true}).waitFor();
      await page.getByRole("button",{name:"Back to Home"}).click();
    }
    await page.getByRole("button",{name:"More →",exact:true}).click();
    await page.getByText("All categories",{exact:true}).waitFor();
    const allCategories = page.getByTestId("all-categories");
    for (const width of [360,390,430]) {
      await page.setViewportSize({width,height:844});
      await page.waitForFunction(viewportWidth => {
        const [first, second] = Array.from(document.querySelectorAll('[data-testid="all-categories"] [data-testid="all-category-card"]')).map(card => card.getBoundingClientRect());
        return first && second && Math.abs(first.y - second.y) < 1 && second.right >= viewportWidth - 22 && second.right <= viewportWidth;
      }, width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() => document.querySelector('[data-testid="all-categories"]')?.getBoundingClientRect().top < 1);
    const photos = await allCategories.getByTestId("all-category-photo").evaluateAll(items => items.slice(0,4).map(item => item.getBoundingClientRect().height));
    assert.ok(photos.length >= 3 && photos.every(height => height >= 105 && height <= 115));
    await page.screenshot({path:path.join(output,"all-categories-390.png")});
    await allCategories.getByRole("button",{name:"Electronics & Mobile Accessories",exact:true}).click();
    await page.getByRole("button",{name:"Back to Home"}).click();
    for (const name of ["Explore shops","See all"]) {
      await page.getByRole("button",{name,exact:true}).click();
      await page.getByText("Shops in Raiyam",{exact:true}).waitFor();
      await page.getByText("←",{exact:true}).first().click();
    }
    await page.getByRole("button",{name:"Search products, shops & brands"}).click();
    await page.getByRole("textbox",{name:"Search products, shops and brands"}).fill("dog");
    await page.getByRole("button",{name:"View dog food",exact:true}).waitFor();
    for (const [tab,heading] of [["Bag","Your bag is waiting."],["Orders","Sign in to view orders"],["Account","Your neighbourhood starts here."],["Browse","Search products, shops & brands"],["Home","Shop by category"]]) {
      await page.getByText(tab,{exact:true}).click();
      if (tab === "Browse") await page.getByPlaceholder(heading).waitFor(); else await page.getByText(heading,{exact:true}).waitFor();
      if (tab === "Account") {
        await page.getByTestId("buyer-account-hub").screenshot({path:path.join(output,"account-390.png")});
        await page.getByText("Sign in / Create account",{exact:true}).click();
        await page.getByTestId("buyer-sign-in").waitFor();
        await page.getByRole("button", {name:"Back from sign in"}).click();
        await page.getByTestId("buyer-account-hub").waitFor();
      }
    }
    await page.getByLabel("Notifications",{exact:true}).click();
    await page.getByText("Notifications",{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log("Guest Home visuals and navigation passed at four sizes.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
