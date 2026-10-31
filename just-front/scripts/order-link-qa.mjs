import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const report = await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json());
assert.equal(report.isolated, true);
const id = report.orders[0].id,
  browser = await chromium.launch({ headless: true }),
  errors = [];
await mkdir("docs/order-link-qa", { recursive: true });
async function pageFor(role) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(20000);
  await p.goto(`http://localhost:8083/__qa/bootstrap/${role}`);
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  return p;
}
try {
  const buyer = await pageFor("buyer");
  await buyer.goto(`http://localhost:8083/orders/${id}`);
  await buyer.getByText("Help with this shop order", { exact: true }).click();
  await buyer.getByLabel("Describe the issue").fill("QA DEMO support navigation test issue");
  await buyer.getByRole("button", { name: "Report issue", exact: true }).click();
  await buyer.getByText("QA DEMO support navigation test issue", { exact: true }).waitFor();
  const p = await pageFor("admin");
  await p.goto("http://localhost:8083/admin/support");
  await p.getByRole("link", { name: "View order", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/admin/orders" && u.searchParams.get("orderId") === id);
  await p.getByRole("heading", { name: `Order ${id}`, exact: true }).waitFor();
  await p.reload();
  await p.getByRole("heading", { name: `Order ${id}`, exact: true }).waitFor();
  assert.equal(await p.getByLabel("Find an order by ID").inputValue(), id);
  await p.goBack();
  await p.getByRole("heading", { name: "Order support", exact: true }).waitFor();
  await p.getByRole("link", { name: "View order", exact: true }).click();
  await p.getByRole("heading", { name: `Order ${id}`, exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear lookup", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/admin/orders" && !u.searchParams.has("orderId"));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  await p.screenshot({ path: "docs/order-link-qa/mobile.png", fullPage: true });
  await writeFile(
    "docs/order-link-qa/report.json",
    JSON.stringify(
      {
        verified: true,
        checks: [
          "support link opens exact order",
          "reload retains lookup",
          "browser back returns support",
          "clear removes lookup from URL",
          "mobile fits",
          "zero page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Admin order deep-link: all 6 checks passed");
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  await browser.close();
}
