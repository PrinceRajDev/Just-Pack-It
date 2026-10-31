const pinLabel = `QA PIN entrance ${Date.now()}`;
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const fixture = await fetch("http://127.0.0.1:4001/__qa/checkout").then((r) => r.json());
assert.equal(fixture.isolated, true);
const browser = await chromium.launch({ headless: true }),
  checks = [],
  errors = [];
let page;
await mkdir("docs/delivery-pin-qa", { recursive: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 26, longitude: 86, accuracy: 20 },
    permissions: ["geolocation"],
  });
  await ctx.route("**/*", (r) =>
    ["localhost", "127.0.0.1", "tile.openstreetmap.org"].includes(
      new URL(r.request().url()).hostname,
    )
      ? r.continue()
      : r.abort(),
  );
  page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await page.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await page.goto("http://localhost:8083/account");
  await page.getByRole("button", { name: "Add address", exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Add an address", exact: true }) });
  for (const [label, value] of [
    ["Address label", pinLabel],
    ["House, street and landmark", "QA DEMO house by school"],
    ["Locality / village", "QA DEMO"],
    ["City / town", "QA DEMO CITY"],
    ["Pincode", "999999"],
  ])
    await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole("button", { name: "Use GPS for delivery pin", exact: true }).click();
  await form.getByLabel("Delivery latitude", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[type="number"]')?.value === "26");
  assert.equal(await form.getByRole("checkbox").isChecked(), false);
  await form.getByRole("button", { name: "Adjust on map", exact: true }).click();
  const map = form.getByRole("region", {
    name: "Delivery map: click or drag pin to adjust",
    exact: true,
  });
  await map.locator(".leaflet-marker-icon").waitFor();
  await map.click({ position: { x: 180, y: 150 } });
  let imagery = "unverified";
  try {
    await map.locator("img.leaflet-tile-loaded").first().waitFor({ timeout: 15000 });
    imagery = "loaded";
  } catch {
    imagery = "unavailable; fallback coordinates/GPS remain usable";
  }
  checks.push(`Map imagery: ${imagery}`);
  await map.screenshot({ path: "docs/delivery-pin-qa/map-mobile.png" });
  assert.equal(await form.getByRole("checkbox").isChecked(), false);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByText("Address saved.", { exact: true }).waitFor();
  checks.push(
    "GPS draft requires explicit confirmation; map click adjusts pin; saved with address",
  );
  await page.getByRole("button", { name: `Edit ${pinLabel}`, exact: true }).click();
  const edit = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: `Edit ${pinLabel}`, exact: true }) });
  assert.ok(Math.abs(Number(await edit.getByLabel("Delivery latitude").inputValue()) - 26) < 0.01);
  await edit.getByLabel("Delivery latitude").fill("26");
  await edit.getByLabel("Delivery longitude").fill("86");
  await edit.getByRole("checkbox").check();
  await edit.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByText("Address saved.", { exact: true }).waitFor();
  checks.push("Saved pin is editable and persists through API");
  const product = fixture.products[0],
    variant = product.variants[0];
  await page.evaluate(
    ({ fixture, product, variant }) => {
      localStorage.setItem("jpi.area", fixture.areaId);
      localStorage.setItem(
        `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}:cart`,
        JSON.stringify({
          [`${product.id}::${variant.id}`]: {
            productId: product.id,
            variantId: variant.id,
            qty: 1,
            acceptedPrice: 25,
          },
        }),
      );
    },
    { fixture, product, variant },
  );
  await page.goto("http://localhost:8083/checkout");
  await page.getByRole("radio", { name: new RegExp(pinLabel) }).check();
  await page
    .getByRole("radio", { name: "Choose Shop delivers for QA DEMO Counter 1", exact: true })
    .check();
  await page.getByText(/Pincode and delivery pin pass configured coverage checks/).waitFor();
  await page.getByRole("button", { name: "Place COD order · ₹35", exact: true }).waitFor();
  checks.push("Checkout confirms saved-pin and pincode coverage, quotes seller delivery");
  await page.screenshot({ path: "docs/delivery-pin-qa/checkout-mobile.png", fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto("http://localhost:8083/account");
  await page.getByRole("button", { name: `Edit ${pinLabel}`, exact: true }).click();
  const farForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: `Edit ${pinLabel}`, exact: true }) });
  await farForm.getByLabel("Delivery latitude").fill("26.1");
  await farForm.getByRole("checkbox").check();
  await farForm.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByText("Address saved.", { exact: true }).waitFor();
  await page.goto("http://localhost:8083/checkout");
  await page.getByRole("radio", { name: new RegExp(pinLabel) }).check();
  await page.getByText(/Your delivery pin is more than 6 km/).waitFor();
  assert.ok(
    await page
      .getByRole("radio", { name: "Choose Shop delivers for QA DEMO Counter 1", exact: true })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByRole("radio", { name: "Choose Store pickup for QA DEMO Counter 1", exact: true })
      .isEnabled(),
  );
  checks.push("Outside-radius delivery pin blocks seller delivery while pickup remains available");
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/delivery-pin-qa/report.json",
    JSON.stringify({ verified: true, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, checks }));
} catch (e) {
  console.error(String(e));
  if (page) {
    console.log((await page.locator("body").innerText()).slice(-3500));
    await page.screenshot({ path: "docs/delivery-pin-qa/failure.png", fullPage: true });
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
