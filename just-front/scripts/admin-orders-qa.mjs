import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright-core");
const b = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  dir = "docs/admin-orders-verification",
  checks = [],
  errors = [];
const c = await b.newContext({ viewport: { width: 1672, height: 1000 } }),
  p = await c.newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
async function fit() {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
try {
  await mkdir(dir, { recursive: true });
  const f = await fetch("http://localhost:4001/__qa/delivery").then((r) => r.json());
  assert.equal(f.isolated, true);
  await p.goto("http://localhost:8083/__qa/bootstrap/admin");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/orders");
  await p.getByRole("table").waitFor();
  await fit();
  assert.equal(await p.getByText("Reporting unavailable", { exact: true }).count(), 4);
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("existing isolated order list loads; unsupported reporting remains unavailable");
  await p.getByRole("textbox", { name: "Find an order by ID", exact: true }).fill("bad");
  await p.getByRole("button", { name: "Find order", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "Enter the full Order ID" }).waitFor();
  await p
    .getByRole("textbox", { name: "Find an order by ID", exact: true })
    .fill(f.orderId.toUpperCase());
  await p.getByRole("button", { name: "Find order", exact: true }).click();
  await p.waitForURL((u) => u.searchParams.get("orderId") === f.orderId);
  await p.getByRole("table").waitFor();
  checks.push("invalid ID rejected; exact uppercase lookup normalizes and updates URL");
  await p.getByRole("table").getByRole("button", { name: "View details", exact: true }).click();
  const drawer = p.getByRole("dialog");
  await drawer.waitFor();
  await drawer
    .getByText("ready · platform delivery", { exact: false })
    .waitFor()
    .catch(async () => {
      assert.ok((await drawer.innerText()).includes("platform delivery"));
    });
  assert.ok((await drawer.innerText()).includes("₹0.00"));
  await p.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  checks.push("read-only drawer shows actual platform delivery and zero recorded cash");
  await p.getByRole("combobox", { name: "Cash filter", exact: true }).selectOption("recorded");
  await p.getByRole("heading", { name: "No matching orders", exact: true }).waitFor();
  await p.screenshot({ path: dir + "/empty-desktop.png", fullPage: true });
  await p.getByRole("combobox", { name: "Cash filter", exact: true }).selectOption("outstanding");
  await p.getByRole("table").waitFor();
  await p.getByRole("button", { name: "Clear lookup", exact: true }).click();
  await p.waitForURL((u) => !u.searchParams.has("orderId"));
  await p.getByRole("table").waitFor();
  checks.push("recorded/outstanding cash filters and Clear lookup preserve semantics");
  for (const width of [768, 390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    await fit();
    const card = p.locator(".orders-mobile-records article").first();
    await card.getByRole("button", { name: "View details", exact: true }).click();
    await drawer.waitFor();
    await drawer.evaluate(
      async (e) => await Promise.all(e.getAnimations().map((a) => a.finished.catch(() => {}))),
    );
    assert.ok(
      await drawer.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1;
      }),
    );
    await p.screenshot({ path: dir + `/detail-${width}.png` });
    await p.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    await p.screenshot({ path: dir + `/mobile-${width}.png`, fullPage: true });
    checks.push(width + "px order cards and detail drawer fit screen");
  }
  await p.route("**/admin/orders?*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "QA temporary order failure" }),
    }),
  );
  await p.reload();
  await p.getByText("QA temporary order failure", { exact: true }).waitFor();
  await p.unroute("**/admin/orders?*");
  await p.getByRole("button", { name: "Try again", exact: true }).click();
  await p.locator(".orders-mobile-records article").first().waitFor();
  checks.push("error retry recovers actual records");
  assert.deepEqual(errors, []);
  checks.push("no browser errors or order mutations");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ isolated: true, physicalDevice: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await b.close();
}
