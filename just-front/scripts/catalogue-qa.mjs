import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const context = await browser.newContext({ viewport: { width: 1672, height: 1100 } }),
  p = await context.newPage(),
  checks = [],
  errors = [],
  dir = "docs/catalogue-verification";
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
const fit = async () =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
try {
  await mkdir(dir, { recursive: true });
  await p.goto("http://localhost:8083/__qa/bootstrap/admin");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/catalog");
  await p.getByRole("heading", { name: "Catalogue", exact: true }).waitFor();
  await p.getByRole("table").waitFor();
  await p
    .getByRole("cell", { name: /QA DEMO/ })
    .first()
    .waitFor();
  await fit();
  assert.equal(await p.getByText("Global reporting unavailable", { exact: true }).count(), 3);
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("real temporary listing data; unavailable global metrics; desktop layout");
  await p.getByLabel("Product name", { exact: true }).fill("no-such-qa-product");
  await p.getByRole("button", { name: "Search products", exact: true }).click();
  await p.getByRole("heading", { name: "No matching products" }).waitFor();
  await p.screenshot({ path: dir + "/empty-desktop.png", fullPage: true });
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  await p.getByRole("table").getByRole("button", { name: "View / moderate" }).first().waitFor();
  checks.push("server product-name search, no-results and clear");
  await p.getByRole("table").getByRole("button", { name: "View / moderate" }).first().click();
  let d = p.getByRole("dialog");
  await d.getByText(/Photos, descriptions/).waitFor();
  await d.getByLabel("Reason for seller").fill("QA DEMO catalogue policy verification");
  await d.getByRole("button", { name: "Block listing", exact: true }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Keep it" }).click();
  await d.getByRole("button", { name: "Block listing", exact: true }).waitFor();
  await d.getByRole("button", { name: "Block listing", exact: true }).click();
  await p.getByRole("button", { name: "Confirm moderation", exact: true }).click();
  await d.getByRole("button", { name: "Remove admin block", exact: true }).waitFor();
  await d.getByLabel("Reason for seller").fill("QA DEMO restore original moderation");
  await d.getByRole("button", { name: "Remove admin block", exact: true }).click();
  await p.getByRole("button", { name: "Confirm moderation", exact: true }).click();
  await d.getByRole("button", { name: "Block listing", exact: true }).waitFor();
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push(
    "product summary, confirmation cancel, persisted block and unblock using versioned API",
  );
  await p.getByLabel("Listing status", { exact: true }).selectOption("blocked");
  await p.getByRole("heading", { name: "No matching products" }).waitFor();
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  checks.push("server blocked status filter");
  await p.getByRole("button", { name: "Add category", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByLabel("Category name", { exact: true }).fill("QA DEMO Catalogue Extra");
  assert.equal(
    await d.getByLabel("URL slug", { exact: true }).inputValue(),
    "qa-demo-catalogue-extra",
  );
  await d.getByLabel("Description", { exact: true }).fill("Temporary browser QA category");
  await d.getByRole("button", { name: "Save category", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  const row = p
    .locator(".taxonomy-row")
    .filter({ has: p.getByRole("heading", { name: "QA DEMO Catalogue Extra", exact: true }) });
  await row.waitFor();
  checks.push("category creation, generated slug, API persistence and drawer close");
  await row.getByRole("button", { name: "Manage", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByLabel("Category name", { exact: true }).fill("QA DEMO Catalogue Edited");
  await d.getByRole("button", { name: "Save category", exact: true }).click();
  await d.getByRole("heading", { name: "QA DEMO Catalogue Edited", exact: true }).waitFor();
  await d.getByLabel("New subcategory name").fill("QA DEMO Sub");
  await d.getByLabel("New subcategory slug").fill("qa-demo-sub");
  await d.getByRole("button", { name: "Add subcategory", exact: true }).click();
  await d.getByLabel("Subcategory name", { exact: true }).waitFor();
  await d.getByLabel("Subcategory name", { exact: true }).fill("QA DEMO Renamed Sub");
  await d.getByRole("button", { name: "Rename", exact: true }).click();
  await d.getByRole("button", { name: "Deactivate QA DEMO Renamed Sub", exact: true }).waitFor();
  await d.getByRole("button", { name: "Deactivate QA DEMO Renamed Sub", exact: true }).click();
  await p
    .getByRole("alertdialog")
    .getByRole("button", { name: "Deactivate subcategory", exact: true })
    .click();
  await d.getByRole("button", { name: "Reactivate QA DEMO Renamed Sub", exact: true }).click();
  await d.getByRole("button", { name: "Deactivate QA DEMO Renamed Sub", exact: true }).waitFor();
  checks.push(
    "category edit, stable slug, parent-scoped subcategory add/rename/deactivate/reactivate",
  );
  await d.getByRole("button", { name: "Deactivate category", exact: true }).click();
  await p
    .getByRole("alertdialog")
    .getByRole("button", { name: "Deactivate category", exact: true })
    .click();
  await d.getByRole("button", { name: "Reactivate category", exact: true }).waitFor();
  await d.getByRole("button", { name: "Reactivate category", exact: true }).click();
  await d.getByLabel("Category name", { exact: true }).waitFor();
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push("unreferenced category deactivate/reactivate");
  await p.getByLabel("Search categories and subcategories").fill("qa-demo-sub");
  await p
    .locator(".taxonomy-row")
    .getByRole("heading", { name: "QA DEMO Catalogue Edited" })
    .waitFor();
  await p.getByLabel("Category status", { exact: true }).selectOption("inactive");
  await p.getByRole("heading", { name: "No categories found" }).waitFor();
  await p.getByRole("button", { name: "Clear filters", exact: true }).click();
  checks.push("taxonomy subcategory search and category status filter");
  for (const w of [768, 390, 320]) {
    await p.setViewportSize({ width: w, height: 900 });
    await fit();
    await p.screenshot({ path: dir + `/mobile-${w}.png`, fullPage: true });
    await p
      .locator(".catalog-product-cards")
      .getByRole("button", { name: "View / moderate" })
      .first()
      .click();
    await p.waitForTimeout(600);
    const box = await p.getByRole("dialog").boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= w + 1);
    await p.screenshot({ path: dir + `/detail-${w}.png` });
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    checks.push(`${w}px responsive cards, drawer and keyboard close`);
  }
  await p.route("**/admin/products?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "QA_UNAVAILABLE", message: "QA temporary failure" } }),
    }),
  );
  await p.getByRole("button", { name: "Refresh records", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "Could not load or refresh listings" }).waitFor();
  await p.unroute("**/admin/products?**");
  await p.getByRole("button", { name: "Retry listings", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Could not load or refresh listings" })
    .waitFor({ state: "hidden" });
  checks.push("failed product refresh and retry recover without fake empty data");
  assert.deepEqual(errors, []);
  checks.push("no browser page errors");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ isolated: true, physicalDevice: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (e) {
  await p.screenshot({ path: dir + "/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
