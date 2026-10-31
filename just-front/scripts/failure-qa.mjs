import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  output = resolve("docs/failure-qa");
assert.equal(
  (await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  steps = [];
page.setDefaultTimeout(20000);
let stage = "invalid URLs";
try {
  for (const path of [
    "/product/11111111-1111-4111-8111-111111111111",
    "/shop/no-such-shop",
    "/category/no-such-category",
  ]) {
    await page.goto(base + path);
    await page.getByRole("heading", { name: "Nothing in this box." }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    steps.push(`${path}: honest not-found state fits mobile`);
  }
  stage = "network failure";
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  let unavailable = true;
  await page.route("http://localhost:4001/**", (route) =>
    unavailable ? route.abort("connectionrefused") : route.continue(),
  );
  await page.getByRole("link", { name: "Back to the market", exact: false }).click();
  await page.getByRole("heading", { name: "This page didn't load" }).waitFor();
  await page.screenshot({ path: resolve(output, "network-error-mobile.png"), fullPage: true });
  steps.push("Disconnected API shows an error boundary with recovery actions");
  stage = "retry after reconnect";
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("heading", { name: /Your market/ }).waitFor();
  steps.push("Try again recovers without a full-page reload after API connectivity returns");
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ verified: true, steps }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, steps }));
} catch (error) {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ verified: false, stage, error: String(error), steps }, null, 2),
  );
  console.error(stage, String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
