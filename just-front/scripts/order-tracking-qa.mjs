import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const api = "http://127.0.0.1:4001",
  base = "http://localhost:8083",
  fixture = await fetch(api + "/__qa/checkout").then((r) => r.json());
assert.equal(fixture.isolated, true);
const browser = await chromium.launch({ headless: true }),
  steps = [],
  errors = [];
await mkdir("docs/order-tracking-qa", { recursive: true });
let page,
  stage = "setup";
async function mode(mode) {
  assert.equal(
    (
      await fetch(api + "/__qa/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      })
    ).status,
    200,
  );
}
async function report() {
  return fetch(api + "/__qa/report").then((r) => r.json());
}
async function setup(mixed = false) {
  await mode("restore");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const p = await context.newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/__qa/bootstrap/buyer");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.waitForFunction(() => {
    const session = JSON.parse(
      localStorage.getItem("jpi.session.api:http://localhost:4001") ?? "null",
    );
    return (
      session?.userId &&
      localStorage.getItem(
        `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${session.userId}:cart`,
      ) !== null
    );
  });
  const product = fixture.products[0],
    variant = product.variants[0];
  await p.evaluate(
    ({ fixture, product, variant, mixed }) => {
      localStorage.setItem("jpi.area", fixture.areaId);
      const lines = {
        [`${product.id}::${variant.id}`]: {
          productId: product.id,
          variantId: variant.id,
          qty: 1,
          acceptedPrice: variant.price,
        },
      };
      if (mixed) {
        const other = fixture.products[1];
        lines[other.id] = { productId: other.id, qty: 1, acceptedPrice: other.price };
      }
      localStorage.setItem(
        `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}:cart`,
        JSON.stringify(lines),
      );
      for (const key of Object.keys(localStorage))
        if (key.startsWith("jpi.cod-attempt:") || key.startsWith("jpi.online-attempt:"))
          localStorage.removeItem(key);
    },
    { fixture, product, variant, mixed },
  );
  await p.goto(base + "/checkout");
  return p;
}
async function choose(p, mixed = false) {
  await p.getByRole("radio", { name: /QA DEMO Home/ }).check();
  await p
    .getByRole("radio", { name: "Choose Store pickup for QA DEMO Counter 1", exact: true })
    .check();
  if (mixed)
    await p
      .getByRole("radio", { name: "Choose Shop delivers for QA DEMO Counter 2", exact: true })
      .check();
  await p
    .getByRole("button", {
      name: mixed ? "Place COD order · ₹95" : "Place COD order · ₹25",
      exact: true,
    })
    .waitFor();
}

try {
  page = await setup();
  await choose(page);
  await page.locator('[aria-label="COD confirmation and recovery"]').getByRole("checkbox").check();
  await page.getByRole("button", { name: "Place COD order · ₹25", exact: true }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]+/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const progress = page.getByRole("list", { name: "Order progress for QA DEMO Counter 1" });
  await progress.locator('li[aria-current="step"]').filter({ hasText: "Order placed" }).waitFor();
  const context = await browser.newContext();
  const seller = await context.newPage();
  await seller.goto(base + "/__qa/bootstrap/seller");
  await seller.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const token = await seller.evaluate(
    () => JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).token,
  );
  const sellerOrders = await context.request.get("http://localhost:4001/seller/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sub = (await sellerOrders.json()).find((s) => s.orderId === id);
  assert.ok(sub);
  const accepted = await context.request.patch(
    `http://localhost:4001/seller/orders/${id}/suborders/${sub.id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { version: sub.version, status: "accepted" },
    },
  );
  assert.equal(accepted.status(), 200);
  await page
    .getByRole("list", { name: "Order progress for QA DEMO Counter 1" })
    .locator('li[aria-current="step"]')
    .filter({ hasText: "Shop accepted" })
    .waitFor({ timeout: 25000 });
  assert.ok(await page.getByText(/Last checked:/).count());
  assert.ok(await page.getByText(/Shop status updated:/).count());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: "docs/order-tracking-qa/mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/order-tracking-qa/report.json",
    JSON.stringify(
      {
        verified: true,
        checks: [
          "mobile pickup timeline reflects placed status",
          "seller-owned accept API succeeds",
          "buyer auto-refresh shows acceptance without manual click",
          "last checked and server shop timestamp shown",
          "no overflow or page errors",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Order tracking browser checks passed");
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  await browser.close();
}
