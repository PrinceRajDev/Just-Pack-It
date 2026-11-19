const { chromium } = require("../../just-front/node_modules/playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

async function run() {
  const data = path.resolve(__dirname, "../qa/home-reference");
  const output = path.resolve(__dirname, "../qa/product-reference");
  const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name + ".json")));
  const live = read(output, "product");
  const shops = read(data, "shops").map(shop => shop.id === live.shopId
    ? { ...shop, name: "Sharma Kirana Store" } : shop);
  const own = {
    ...live, name: "Farm fresh tomatoes", unit: "500 g", price: 24, stock: 12,
    taxInclusive: true, image: "https://fixture.test/tomatoes.png",
    variants: [
      { id: "qa-500", label: "500 g", price: 24, stock: 12 },
      { id: "qa-1kg", label: "1 kg", price: 44, stock: 8 },
    ],
  };
  const categories = read(data, "categories").map(category =>
    category.slug === live.categorySlug ? { ...category, name: "Fresh produce" } : category);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ||
      "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(own.image, route => route.fulfill({ path: path.join(output, "fixture-photo.png") }));
    await page.route("https://just-pack-it-bq64.onrender.com/**", async route => {
      const resource = new URL(route.request().url()).pathname.slice(1);
      const body = resource === "products/" + live.id ? own
        : resource === "products" || /^shops\/[^/]+\/products$/.test(resource) ? [own]
        : resource === "shops" ? shops
        : resource === "categories" ? categories
        : resource === "areas" ? read(data, "areas") : null;
      await route.fulfill({ body: JSON.stringify(body), contentType: "application/json",
        headers: { "access-control-allow-origin": "*" } });
    });
    await page.goto(process.env.PREVIEW_URL || "http://localhost:8097", { timeout: 90000 });
    await page.getByText("Shops around you", { exact: true }).waitFor({ timeout: 60000 });
    await page.getByText("Browse", { exact: true }).click();
    await page.getByRole("textbox", { name: "Search products, shops and brands" }).fill("tomato");
    const open = page.getByRole("button", { name: "View Farm fresh tomatoes", exact: true });
    await open.click();
    await page.addStyleTag({ content: '[data-testid="product-safe"]{padding-top:28px!important;padding-bottom:20px!important}' });
    const add = page.getByTestId("product-add");
    const smallPack = page.getByRole("radio", { name: "Pack 500 g", exact: true });
    const largePack = page.getByRole("radio", { name: "Pack 1 kg", exact: true });
    async function assertPack(selected, unselected, price, stock) {
      await page.getByText(`In stock · ${stock} packs available`, { exact: true }).waitFor();
      assert.equal(await selected.getAttribute("aria-checked"), "true");
      assert.equal(await unselected.getAttribute("aria-checked"), "false");
      assert.equal(await selected.evaluate(node => getComputedStyle(node).backgroundColor), "rgb(234, 240, 217)");
      assert.equal(await unselected.evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
      await page.getByTestId("product-scroll").getByText(`₹${price}`, { exact: true }).waitFor();
      assert.equal(await add.innerText(), `Add to Bag · ₹${price}`);
    }
    await assertPack(largePack, smallPack, 44, 8);
    await page.getByRole("button", { name: "Visit Sharma Kirana Store" }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="product-gallery"] img')]
      .some(image => image.complete && image.naturalWidth > 0));
    for (const [width, height] of [[390,844],[360,800],[375,812],[430,932]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-testid="product-add"]');
        return button && Math.abs(button.getBoundingClientRect().bottom - (innerHeight - 34)) < 2;
      });
      await page.getByTestId("product-scroll").evaluate(element => { element.scrollTop = 0; });
      const bar = await add.boundingBox();
      assert.ok(bar.y >= 0 && Math.abs(bar.y + bar.height - (height - 34)) < 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, "product-1kg-" + width + ".png") });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await smallPack.click();
    await assertPack(smallPack, largePack, 24, 12);
    await page.screenshot({ path: path.join(output, "product-500g-390.png") });
    await largePack.click();
    await assertPack(largePack, smallPack, 44, 8);
    await page.getByRole("button", { name: "Save product to favourites" }).click();
    await page.getByRole("button", { name: "Remove product from favourites" }).waitFor();
    await page.getByRole("button", { name: "Back from product" }).click();
    await open.click();
    await page.getByRole("button", { name: "Remove product from favourites" }).waitFor();
    await page.getByRole("radio", { name: "Pack 1 kg" }).click();
    await page.getByText("Add to Bag · ₹44", { exact: true }).waitFor();
    await page.getByText("In stock · 8 packs available", { exact: true }).waitFor();
    await add.click();
    const [line] = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jpi.bag.guest") || "[]"));
    assert.equal(line.productId, live.id);
    assert.equal(line.variantId, "qa-1kg");
    assert.equal(line.price, 44);
    assert.equal(line.quantity, 1);
    assert.equal(line.unit, "1 kg");
    await page.getByRole("button", { name: "Back from product" }).click();
    own.variants[1].stock = 0;
    await open.click();
    await assertPack(smallPack, largePack, 24, 12);
    await largePack.click();
    await page.getByText("Out of stock", { exact: true }).first().waitFor();
    assert.equal(await add.isDisabled(), true);
    await page.getByRole("button", { name: "Visit Sharma Kirana Store" }).click();
    await page.getByText("Sharma Kirana Store", { exact: true }).first().waitFor();
    assert.deepEqual(errors, []);
    console.log("PASS: search navigation, image, four viewports, packs, stock, wishlist, bag payload, seller link");
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
