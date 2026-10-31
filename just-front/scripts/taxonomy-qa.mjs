import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
assert.equal(
  (await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
const runId = Date.now().toString();
const browser = await chromium.launch({ headless: true }),
  errors = [],
  checks = [];
await mkdir("docs/taxonomy-qa", { recursive: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(20000);
  await p.goto("http://localhost:8083/__qa/bootstrap/admin");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/catalog");
  await p.getByLabel("Category name", { exact: true }).first().fill(`QA DEMO taxonomy ${runId}`);
  await p.getByLabel("URL slug", { exact: true }).fill(`qa-demo-taxonomy-${runId}`);
  await p.getByRole("button", { name: "Save category", exact: true }).first().click();
  await p.getByRole("button", { name: "Close toast", exact: true }).click();
  const panel = p
    .locator("section")
    .filter({ has: p.getByRole("heading", { name: `QA DEMO taxonomy ${runId}`, exact: true }) });
  await panel.waitFor();
  assert.equal(await p.getByLabel("Category name", { exact: true }).first().inputValue(), "");
  checks.push("Create category persists and clears new-category form");
  await panel.getByLabel("New subcategory name", { exact: true }).fill("QA DEMO Leafy");
  await panel.getByLabel("New subcategory slug", { exact: true }).fill(`qa-demo-leafy-${runId}`);
  await panel.getByRole("button", { name: "Add subcategory", exact: true }).click();
  await panel.getByLabel("Subcategory name", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Close toast", exact: true }).click();
  await p
    .getByLabel("Search categories and subcategories", { exact: true })
    .fill(`qa-demo-leafy-${runId}`);
  await panel.waitFor();
  await p.getByLabel(/Category status/).selectOption("inactive");
  await p
    .getByText("No categories match these filters. Clear filters to see all categories.")
    .waitFor();
  await p.getByRole("button", { name: "Clear filters", exact: true }).click();
  checks.push("Subcategory slug search and combined status filtering work");
  await panel.getByRole("button", { name: "Deactivate QA DEMO Leafy", exact: true }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Keep it", exact: true }).click();
  assert.ok(await panel.getByLabel("Subcategory name", { exact: true }).isEnabled());
  await panel.getByRole("button", { name: "Deactivate QA DEMO Leafy", exact: true }).click();
  await p
    .getByRole("alertdialog")
    .getByRole("button", { name: "Deactivate subcategory", exact: true })
    .click();
  await panel.getByLabel("Subcategory name (inactive)", { exact: true }).waitFor();
  assert.ok(await panel.getByLabel("Subcategory name (inactive)", { exact: true }).isDisabled());
  await p.getByRole("button", { name: "Close toast", exact: true }).click();
  checks.push(
    "Cancel is non-mutating; confirmed subcategory deactivation persists and disables editing",
  );
  await panel.getByRole("button", { name: "Deactivate category", exact: true }).click();
  await p
    .getByRole("alertdialog")
    .getByRole("button", { name: "Deactivate category", exact: true })
    .click();
  await p
    .getByRole("heading", { name: `QA DEMO taxonomy ${runId} (inactive)`, exact: true })
    .waitFor();
  await p.getByLabel(/Category status/).selectOption("inactive");
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: "docs/taxonomy-qa/mobile.png", fullPage: true });
  checks.push("Confirmed unused category deactivation and inactive filter persist; mobile fits");
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/taxonomy-qa/report.json",
    JSON.stringify({ verified: true, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, checks }));
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  await browser.close();
}
