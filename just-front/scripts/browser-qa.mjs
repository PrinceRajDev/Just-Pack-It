import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  api = "http://127.0.0.1:4001",
  output = resolve("docs/browser-qa");
const before = await fetch(`${api}/__qa/report`).then((response) => response.json());
assert.equal(before.isolated, true, "Only the isolated QA server may be used");
assert.equal(before.orders.length, 0, "Restart the isolated QA API for a fresh run");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const contexts = [],
  errors = [],
  steps = [],
  posts = [];
let stage = "startup",
  buyer;
async function pageFor(role) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  contexts.push(context);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname) && ["8083", "4001"].includes(url.port))
      return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/__qa/bootstrap/${role}`);
  await page.waitForURL((url) => !url.pathname.startsWith("/__qa"));
  if (role === "buyer") {
    await page.locator('header a[href="/account"]').waitFor();
    await contains(page, "Choose your area to discover local shops");
  } else await page.getByRole("heading", { level: 1 }).first().waitFor();
  return page;
}
async function contains(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor();
}
async function inbox(page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  return page.getByRole("dialog", { name: "Your updates" });
}
async function closeInbox(dialog) {
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
}
async function shopCard(page, name) {
  return page.locator("article").filter({ hasText: name }).first();
}
async function advance(page) {
  await page.getByRole("button", { name: "Accept order", exact: true }).click();
  await contains(page, "Order status saved: accepted.");
  await page.getByLabel("Order status").selectOption("accepted");
  await page.getByRole("button", { name: "Start preparing", exact: true }).click();
  await contains(page, "Order status saved: preparing.");
  await page.getByLabel("Order status").selectOption("preparing");
  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await contains(page, "Order status saved: ready.");
  await page.getByLabel("Order status").selectOption("ready");
}
async function receiptFor(name) {
  await buyer.getByRole("button", { name: "Refresh order status", exact: true }).click();
  const section = buyer
    .locator("section")
    .filter({ has: buyer.getByRole("heading", { name, exact: true }) })
    .last();
  const receipt = section.locator('[aria-label="Buyer receipt confirmation"]');
  await receipt.waitFor();
  for (const checkbox of await receipt.getByRole("checkbox").all()) await checkbox.check();
  await receipt.getByRole("button", { name: "Generate receipt code", exact: true }).click();
  const code = await receipt.getByLabel("One-time receipt code", { exact: true }).innerText();
  assert.match(code, /^[0-9]{6}$/);
  return code;
}
async function recordCash(page, code) {
  await page.getByLabel("Buyer's six-digit receipt code", { exact: true }).fill(code);
  await page.getByRole("checkbox", { name: /I actually received/ }).check();
  await page.getByRole("button", { name: "Confirm handoff & record cash", exact: true }).click();
  await contains(page, "Order status saved: delivered.");
  await page.getByLabel("Order status").selectOption("delivered");
  await contains(page, "Cash recorded:");
}
try {
  buyer = await pageFor("buyer");
  stage = "category discovery";
  await buyer
    .getByRole("banner")
    .getByRole("button", { name: "Choose delivery area", exact: true })
    .click();
  await buyer.getByRole("button", { name: /QA DEMO AREA, QA DEMO CITY/ }).click();
  await buyer
    .getByRole("link", { name: /QA DEMO Grocery/ })
    .first()
    .click();
  await buyer.waitForURL(/\/category\/qa-demo-grocery/);
  await contains(buyer, "QA DEMO Counter 1");
  await contains(buyer, "QA DEMO Counter 2");
  steps.push("Area/category shows both eligible QA shops");
  await buyer.locator('a[href="/shop/qa-demo-counter-1"]').first().click();
  await buyer.getByRole("heading", { name: "QA DEMO Counter 1", exact: true }).waitFor();
  await buyer.getByRole("link", { name: "QA DEMO Rice", exact: true }).first().click();
  await buyer.getByRole("heading", { name: "QA DEMO Rice", exact: true }).waitFor();
  stage = "mobile variant selection";
  await buyer.setViewportSize({ width: 390, height: 844 });
  const option = buyer.getByRole("radio", { name: /1 kg, ₹40/ });
  await buyer.locator("label").filter({ has: option }).click();
  await contains(buyer, "Selected: 1 kg");
  const quick = buyer.getByRole("region", { name: "Quick add to bag" });
  await quick.getByRole("button", { name: "Add", exact: true }).click();
  assert.ok(
    await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Mobile product page must not overflow horizontally",
  );
  await buyer.screenshot({ path: resolve(output, "mobile-product.png"), fullPage: true });
  steps.push("Mobile variant price/stock/quick-add and width checked");
  await buyer.setViewportSize({ width: 1366, height: 900 });
  await buyer
    .locator("label")
    .filter({ has: buyer.getByRole("radio", { name: /500 g, ₹25/ }) })
    .click();
  await contains(buyer, "Selected: 500 g");
  await buyer
    .locator(".product-detail-purchase")
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await buyer.goto(`${base}/category/qa-demo-grocery`);
  await buyer.locator('a[href="/shop/qa-demo-counter-2"]').first().click();
  await buyer.getByRole("link", { name: "QA DEMO Rice", exact: true }).first().click();
  await contains(buyer, "₹60");
  await buyer
    .locator(".product-detail-purchase")
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await buyer.waitForFunction(
    () =>
      Object.keys(
        JSON.parse(
          localStorage.getItem(
            `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}:cart`,
          ) ?? "{}",
        ),
      ).length === 3,
  );
  steps.push("Two shop-owned prices and two independent variants added");
  stage = "checkout and lost response recovery";
  await buyer.goto(`${base}/checkout`);
  await buyer.getByRole("radio", { name: /QA DEMO Home/ }).check();
  await buyer
    .getByRole("radio", { name: "Choose Store pickup for QA DEMO Counter 1", exact: true })
    .check();
  await buyer
    .getByRole("radio", { name: "Choose Shop delivers for QA DEMO Counter 2", exact: true })
    .check();
  await contains(buyer, "Payable on delivery / collection: ₹135");
  await buyer.screenshot({ path: resolve(output, "checkout.png"), fullPage: true });
  let drop = true;
  await buyer.route("http://localhost:4001/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (drop) {
      drop = false;
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await buyer.locator('[aria-label="COD confirmation and recovery"]').getByRole("checkbox").check();
  await buyer.getByRole("button", { name: "Place COD order · ₹135", exact: true }).click();
  await buyer
    .getByRole("button", { name: "Recover previous order attempt", exact: true })
    .waitFor();
  await buyer.getByRole("button", { name: "Recover previous order attempt", exact: true }).click();
  await buyer.waitForURL(/\/orders\/[0-9a-f-]+/);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].key, posts[1].key);
  assert.equal(posts[0].body, posts[1].body);
  await contains(buyer, "Current COD amount due: ₹135");
  await buyer.reload();
  await contains(buyer, "Current COD amount due: ₹135");
  assert.equal(
    (await fetch(`${api}/__qa/report`).then((response) => response.json())).orders.length,
    1,
  );
  steps.push("Lost create response recovered with same key/payload; reload created no duplicate");
  stage = "seller processing";
  const seller = await pageFor("seller"),
    other = await pageFor("other-seller");
  await contains(seller, "QA DEMO Counter 1");
  assert.equal(await seller.getByText("QA DEMO Counter 2", { exact: true }).count(), 0);
  const sellerInbox = await inbox(seller);
  await sellerInbox.getByRole("heading", { name: "New shop order", exact: true }).waitFor();
  assert.equal(
    await sellerInbox.getByRole("heading", { name: "New shop order", exact: true }).count(),
    1,
  );
  await closeInbox(sellerInbox);
  steps.push("Seller receives one new-order alert despite buyer lost-response retry");
  await advance(seller);
  await advance(other);
  await other.getByRole("button", { name: "Mark out for delivery", exact: true }).click();
  await contains(other, "Order status saved: out_for_delivery.");
  await other.getByLabel("Order status").selectOption("out_for_delivery");
  steps.push("Owned seller processing, pickup ready and seller delivery dispatched");
  stage = "buyer/seller receipt cash confirmations";
  let code = await receiptFor("QA DEMO Counter 1");
  await recordCash(seller, code);
  code = "";
  await buyer.getByRole("button", { name: "Refresh order status", exact: true }).click();
  await contains(buyer, "Current COD amount due: ₹70");
  code = await receiptFor("QA DEMO Counter 2");
  await recordCash(other, code);
  code = "";
  await buyer.getByRole("button", { name: "Refresh order status", exact: true }).click();
  await contains(buyer, "Current COD amount due: ₹0");
  await contains(buyer, "Cash recorded: ₹135");
  assert.equal(
    await buyer.getByRole("button", { name: "Generate receipt code", exact: true }).count(),
    0,
  );
  await buyer.screenshot({ path: resolve(output, "completed-order.png"), fullPage: true });
  await seller.screenshot({ path: resolve(output, "seller-completed.png"), fullPage: true });
  await buyer.setViewportSize({ width: 390, height: 844 });
  stage = "mobile notification read persistence";
  const buyerInbox = await inbox(buyer);
  await buyerInbox.getByRole("heading", { name: "Order placed", exact: true }).waitFor();
  assert.equal(
    await buyerInbox.getByRole("heading", { name: "Order placed", exact: true }).count(),
    1,
  );
  assert.equal(
    await buyerInbox.getByRole("heading", { name: "Shop handoff confirmed", exact: true }).count(),
    2,
  );
  const placedAlert = buyerInbox
    .locator("li")
    .filter({ hasText: "Your shops will review their parts of the order." });
  await placedAlert.getByRole("button", { name: "Mark as read", exact: true }).click();
  await placedAlert
    .getByRole("button", { name: "Mark as read", exact: true })
    .waitFor({ state: "detached" });
  assert.ok(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await buyer.screenshot({ path: resolve(output, "mobile-notifications.png"), fullPage: true });
  await closeInbox(buyerInbox);
  await buyer.reload();
  const persistedInbox = await inbox(buyer);
  await persistedInbox.getByRole("heading", { name: "Order placed", exact: true }).waitFor();
  assert.equal(
    await persistedInbox
      .locator("li")
      .filter({ hasText: "Your shops will review their parts of the order." })
      .getByRole("button", { name: "Mark as read", exact: true })
      .count(),
    0,
  );
  await closeInbox(persistedInbox);
  steps.push(
    "Mobile buyer inbox shows deduplicated order and both handoffs; read state survives reload",
  );
  assert.ok(
    await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Mobile order page must not overflow",
  );
  await buyer.screenshot({ path: resolve(output, "mobile-completed-order.png"), fullPage: true });
  const after = await fetch(`${api}/__qa/report`).then((response) => response.json());
  assert.equal(after.orders.length, 1);
  assert.equal(after.orders[0].paymentStatus, "cash_recorded");
  assert.ok(after.orders[0].subOrders.every((sub) => sub.status === "delivered"));
  const variantProduct = after.products.find((product) => product.variants.length),
    baseProduct = after.products.find((product) => !product.variants.length);
  assert.equal(variantProduct.stock, 99);
  assert.deepEqual(
    variantProduct.variants.map((variant) => variant.stock),
    [4, 2],
  );
  assert.equal(baseProduct.stock, 3);
  steps.push(
    "Both receipt codes consumed; cash recorded once; original stock decrements preserved",
  );
  stage = "admin smoke";
  const admin = await pageFor("admin");
  await admin.goto(`${base}/admin/catalog`);
  await contains(admin, "QA DEMO Grocery");
  steps.push("Admin taxonomy smoke check with real isolated API");
  await admin.goto(`${base}/admin/orders`);
  await admin.getByRole("heading", { name: "Orders & cash records", exact: true }).waitFor();
  await admin.getByRole("heading", { name: `Order ${after.orders[0].id}`, exact: true }).waitFor();
  assert.match(await admin.locator("body").innerText(), /₹135\.00/);
  await admin.getByRole("combobox", { name: "Cash filter" }).selectOption("outstanding");
  await admin.getByText("No matching orders", { exact: true }).waitFor();
  await admin.getByRole("combobox", { name: "Cash filter" }).selectOption("recorded");
  await admin.getByRole("heading", { name: `Order ${after.orders[0].id}`, exact: true }).waitFor();
  await admin.setViewportSize({ width: 390, height: 844 });
  const adminInbox = await inbox(admin);
  await adminInbox
    .getByRole("heading", { name: "Shop application submitted", exact: true })
    .first()
    .waitFor();
  assert.equal(
    await adminInbox
      .getByRole("heading", { name: "Shop application submitted", exact: true })
      .count(),
    2,
  );
  await closeInbox(adminInbox);
  steps.push(
    "Admin notifications remain accessible on mobile and show both isolated shop submissions",
  );
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await admin.screenshot({ path: resolve(output, "admin-cash-records.png"), fullPage: true });
  steps.push("Admin cash monitor shows recorded order, filters outstanding cash and fits mobile");
  await admin.goto(`${base}/admin/finance`);
  await admin
    .getByRole("heading", { name: "Online payments & reconciliation", exact: true })
    .waitFor();
  await admin.getByText("No matching online payments", { exact: true }).waitFor();
  await admin.getByRole("combobox", { name: "Payment state" }).selectOption("uncertain");
  await admin.getByRole("combobox", { name: "Payment mode" }).selectOption("test");
  await admin.getByText("No matching online payments", { exact: true }).waitFor();
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await admin.screenshot({
    path: resolve(output, "admin-online-payments-empty.png"),
    fullPage: true,
  });
  steps.push(
    "Admin online-payment route, filters and honest empty state fit mobile with gateway disabled",
  );
  assert.deepEqual(errors, [], "No browser runtime errors expected");
  const report = {
    isolated: true,
    headless: true,
    browser: browser.version(),
    steps,
    verified: true,
    createRequests: posts.length,
    sameKeyReplay: true,
    state: after,
  };
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { verified: true, steps, browser: browser.version(), report: "docs/browser-qa/report.json" },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(
      { isolated: true, verified: false, stage, error: String(error), steps },
      null,
      2,
    ),
  );
  console.error(JSON.stringify({ stage, error: String(error), runtimeErrors: errors }));
  if (buyer) {
    await buyer
      .screenshot({
        path: resolve(output, "failed-stage.png"),
        fullPage: true,
        mask: [buyer.getByLabel("One-time receipt code", { exact: true })],
      })
      .catch(() => {});
    const body = await buyer
      .locator("body")
      .innerText()
      .catch(() => "");
    console.error(
      JSON.stringify(
        {
          stage,
          error: String(error),
          runtimeErrors: errors,
          body: body.replace(/\b\d{6}\b/g, "[redacted]").slice(0, 7000),
        },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
