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
await mkdir("docs/checkout-regression", { recursive: true });
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
async function confirm(p) {
  await p.locator('[aria-label="COD confirmation and recovery"]').getByRole("checkbox").check();
}
async function count() {
  return (await report()).orders.length;
}
async function rejection(kind) {
  stage = kind + " after review";
  page = await setup();
  await choose(page);
  const before = await count();
  await mode(kind);
  await confirm(page);
  await page.getByRole("button", { name: "Place COD order · ₹25", exact: true }).click();
  await page.getByRole("button", { name: "Return to a fresh review", exact: true }).waitFor();
  assert.equal(await count(), before);
  const state = await page.evaluate(
    () => Object.entries(localStorage).find(([k]) => k.startsWith("jpi.cod-attempt:"))?.[1],
  );
  assert.equal(JSON.parse(state).state, "rejected");
  steps.push({ scenario: stage, status: "pass", code: JSON.parse(state).errorCode });
  await page.context().close();
}
try {
  stage = "pickup reproduction";
  page = await setup();
  await choose(page);
  steps.push({ scenario: "Pickup selection reaches final COD review on mobile", status: "pass" });
  await page.screenshot({ path: "docs/checkout-regression/pickup-mobile.png", fullPage: true });
  await page.context().close();
  stage = "mixed shops and double click";
  page = await setup(true);
  await choose(page, true);
  const before = await count();
  let posts = 0;
  await page.route("**/orders", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.continue();
  });
  await confirm(page);
  await page
    .getByRole("button", { name: "Place COD order · ₹95", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await page.waitForURL(/\/orders\/[0-9a-f-]+/);
  let data = await report();
  assert.equal(data.orders.length, before + 1);
  assert.equal(posts, 1);
  const order = data.orders.at(-1);
  assert.equal(order.totalCents, 9500);
  assert.equal(order.subOrders.length, 2);
  assert.equal(data.products[0].variants[0].stock, 4);
  assert.equal(data.products[1].stock, 3);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  steps.push({ scenario: stage, status: "pass", posts, total: 95, suborders: 2 });
  await page.context().close();
  for (const kind of ["closed", "stock", "price", "address"]) await rejection(kind);
  stage = "address selection change";
  page = await setup(true);
  await choose(page, true);
  await page.getByRole("radio", { name: /QA DEMO Outside/ }).check();
  await page.getByRole("button", { name: /Place COD order/ }).waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("radio", { name: /Choose Store pickup/ })
      .first()
      .isChecked(),
    false,
  );
  steps.push({
    scenario: stage,
    status: "pass",
    detail: "fulfilment selections cleared; order button unavailable until new review",
  });
  await page.context().close();
  stage = "area change with cart";
  page = await setup();
  await choose(page);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Choose delivery area", exact: true })
    .click();
  await page.getByRole("button", { name: /QA DEMO OTHER AREA, QA DEMO CITY/ }).click();
  await page.getByRole("button", { name: /Place COD order/ }).waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(
          JSON.parse(
            localStorage.getItem(
              `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}:cart`,
            ),
          ),
        ).length,
    ),
    1,
  );
  steps.push({
    scenario: stage,
    status: "pass",
    detail: "cart preserved; old-area order not placeable",
  });
  await page.context().close();
  for (const afterCommit of [false, true]) {
    stage = afterCommit
      ? "lost response after commit + reload recovery"
      : "offline submit before receive + reload recovery";
    page = await setup();
    await choose(page);
    const beforeRecovery = await count(),
      requests = [];
    let drop = true;
    await page.route("**/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      if (drop) {
        drop = false;
        if (afterCommit) await route.fetch();
        return route.abort("failed");
      }
      return route.continue();
    });
    await confirm(page);
    await page.getByRole("button", { name: "Place COD order · ₹25", exact: true }).click();
    await page
      .getByRole("button", { name: "Recover previous order attempt", exact: true })
      .waitFor();
    assert.equal(await count(), beforeRecovery + (afterCommit ? 1 : 0));
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(
            JSON.parse(
              localStorage.getItem(
                `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}:cart`,
              ),
            ),
          ).length,
      ),
      1,
    );
    await page.reload();
    await page.getByRole("link", { name: "Recover it from your account", exact: true }).click();
    await page.getByRole("button", { name: "Recover previous order attempt", exact: true }).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+/);
    assert.equal(await count(), beforeRecovery + 1);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].key, requests[1].key);
    assert.equal(requests[0].body, requests[1].body);
    data = await report();
    assert.equal(data.products[0].variants[0].stock, 4);
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(
            JSON.parse(
              localStorage.getItem(
                `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}:cart`,
              ),
            ),
          ).length,
      ),
      0,
    );
    steps.push({
      scenario: stage,
      status: "pass",
      sameKey: true,
      ordersCreated: 1,
      stockDeductedOnce: true,
    });
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/checkout-regression/report.json",
    JSON.stringify({ verified: true, steps, errors }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, steps }));
} catch (e) {
  console.error(stage, String(e));
  if (page) {
    console.log((await page.locator("body").innerText()).slice(-11000));
    await page.screenshot({ path: "docs/checkout-regression/failure.png", fullPage: true });
  }
  await writeFile(
    "docs/checkout-regression/report.json",
    JSON.stringify({ verified: false, stage, error: String(e), steps, errors }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
