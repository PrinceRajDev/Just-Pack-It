import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
assert.equal(
  (await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 26, longitude: 86, accuracy: 20 },
    permissions: ["geolocation"],
  }),
  page = await context.newPage(),
  steps = [];
page.setDefaultTimeout(20000);
await mkdir("docs/gps-qa", { recursive: true });
try {
  await page.goto("http://localhost:8083/");
  await page.waitForLoadState("networkidle");
  const notice = page.getByRole("region", { name: "Shopping area" });
  await notice.getByRole("button", { name: "Use my location · within 6 km", exact: true }).click();
  await notice.getByText("Shopping in QA DEMO AREA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Keep browsing", exact: true }).click();
  await page.locator('a.shop-card[href="/shop/qa-demo-counter-1"]').first().waitFor();
  assert.equal(await page.locator('a.shop-card[href="/shop/qa-demo-counter-2"]').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("jpi.area")), null);
  steps.push(
    "Explicit GPS permission finds one eligible shop within6km; outside shop hidden and coordinates not persisted",
  );
  await notice.getByRole("button", { name: "Choose delivery area", exact: true }).click();
  await page.getByRole("button", { name: /QA DEMO AREA, QA DEMO CITY/ }).click();
  await page.locator('a.shop-card[href="/shop/qa-demo-counter-2"]').first().waitFor();
  steps.push(
    "Manual service-area fallback clears GPS filtering and restores both eligible area shops",
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: "docs/gps-qa/mobile.png", fullPage: true });
  await writeFile("docs/gps-qa/report.json", JSON.stringify({ verified: true, steps }, null, 2));
  console.log(JSON.stringify({ verified: true, steps }));
} catch (error) {
  await writeFile(
    "docs/gps-qa/report.json",
    JSON.stringify({ verified: false, error: String(error), steps }, null, 2),
  );
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
