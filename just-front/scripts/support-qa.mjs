import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const report = await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json());
assert.equal(report.isolated, true);
assert.ok(report.orders.length);
const browser = await chromium.launch({ headless: true }),
  errors = [],
  steps = [];
await mkdir("docs/support-qa", { recursive: true });
async function pageFor(role) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.goto(`http://localhost:8083/__qa/bootstrap/${role}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  return page;
}
try {
  const buyer = await pageFor("buyer");
  await buyer.goto(`http://localhost:8083/orders/${report.orders[0].id}`);
  await buyer.getByText("Help with this shop order", { exact: true }).first().click();
  await buyer.getByText("Loading support�", { exact: true }).waitFor({ state: "hidden" });
  if (await buyer.getByLabel("Describe the issue").count()) {
    await buyer
      .getByLabel("Describe the issue")
      .fill("QA DEMO item quality issue for isolated test");
    await buyer.getByRole("button", { name: "Report issue", exact: true }).click();
  }
  await buyer.getByText("QA DEMO item quality issue for isolated test", { exact: true }).waitFor();
  steps.push("Buyer submits shop-specific issue and sees saved ticket");
  const admin = await pageFor("admin");
  await admin.goto("http://localhost:8083/admin/support");
  await admin
    .getByLabel("Buyer-visible update / resolution")
    .fill("QA DEMO reviewed and resolved; no money movement");
  await admin.getByRole("button", { name: "Mark in progress", exact: true }).click();
  await admin.getByText(/missing item.*in progress/).waitFor();
  await admin.getByRole("button", { name: "Resolve ticket", exact: true }).click();
  await admin
    .getByText("Resolution: QA DEMO reviewed and resolved; no money movement", { exact: true })
    .waitFor();
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await admin.screenshot({ path: "docs/support-qa/admin-mobile.png", fullPage: true });
  steps.push("Admin tracks in progress then resolves with buyer-visible note; mobile fits");
  await buyer.getByRole("button", { name: "Refresh status", exact: true }).click();
  await buyer
    .getByText("Admin note: QA DEMO reviewed and resolved; no money movement", { exact: true })
    .waitFor();
  await buyer.screenshot({ path: "docs/support-qa/buyer-mobile.png", fullPage: true });
  steps.push("Buyer refresh sees admin resolution");
  const seller = await pageFor("seller");
  await seller.goto("http://localhost:8083/seller/orders");
  await seller.getByRole("button", { name: "Enable order sound", exact: true }).click();
  await seller.getByRole("button", { name: "Turn sound off", exact: true }).waitFor();
  await seller.getByRole("button", { name: "Review new orders", exact: true }).click();
  assert.ok(await seller.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await seller.screenshot({ path: "docs/support-qa/seller-mobile.png", fullPage: true });
  steps.push(
    "Seller explicitly enables audio context and reviews new orders; mobile fits (audibility not manually verified)",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/support-qa/report.json",
    JSON.stringify({ verified: true, steps, errors }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, steps }));
} catch (e) {
  console.error(String(e));
  for (const [i, context] of browser.contexts().entries())
    for (const page of context.pages()) {
      console.log(
        `QA page ${i}: ` +
          (
            await page
              .locator("main")
              .innerText()
              .catch(() => page.locator("body").innerText())
          ).slice(-3500),
      );
      await page.screenshot({ path: `docs/support-qa/failure-${i}.png`, fullPage: true });
    }
  await writeFile(
    "docs/support-qa/report.json",
    JSON.stringify({ verified: false, steps, errors, error: String(e) }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
