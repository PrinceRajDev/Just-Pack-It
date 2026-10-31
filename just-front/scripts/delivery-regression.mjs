import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  api = "http://localhost:4001";
const fixture = await fetch(api + "/__qa/delivery").then((r) => r.json());
assert.equal(fixture.isolated, true);
const browser = await chromium.launch({ headless: true }),
  contexts = [],
  errors = [];
async function login(role) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(c);
  await c.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(18000);
  await p.goto(base + "/__qa/bootstrap/" + role);
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  return p;
}
try {
  const partner = await login("delivery");
  await partner.getByRole("button", { name: "Claim task", exact: true }).waitFor();
  assert.equal(await partner.getByText("Drop-off: QA DEMO DROP", { exact: false }).count(), 0);
  await partner.getByRole("button", { name: "Claim task", exact: true }).click();
  await partner.getByRole("region", { name: "Active delivery", exact: true }).waitFor();
  await partner.getByText("Drop-off: QA DEMO DROP", { exact: false }).waitFor();
  assert.equal(
    await partner.getByRole("button", { name: "Start delivery", exact: true }).count(),
    0,
  );
  await partner.getByRole("button", { name: "Show contact numbers", exact: true }).click();
  await partner.getByRole("link", { name: "Call buyer", exact: true }).waitFor();
  assert.match(
    await partner
      .getByRole("link", { name: "Drop-off navigation (external map)", exact: true })
      .getAttribute("href"),
    /destination=26,86/,
  );
  const seller = await login("seller");
  await seller.getByLabel("Order status", { exact: true }).selectOption("ready");
  await seller
    .getByRole("button", { name: "Confirm goods handed to assigned partner", exact: true })
    .waitFor();
  seller.on("dialog", (d) => d.accept());
  await seller
    .getByRole("button", { name: "Confirm goods handed to assigned partner", exact: true })
    .click();
  await partner.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await partner.getByRole("button", { name: "Start delivery", exact: true }).click();
  await partner.getByRole("button", { name: "Verify code and complete", exact: true }).waitFor();
  const buyer = await login("buyer");
  await buyer.goto(base + "/orders/" + fixture.orderId);
  await buyer.getByLabel("I received all items in this shop's suborder.", { exact: true }).check();
  await buyer.getByLabel("I paid ₹25 in cash for this shop's suborder.", { exact: true }).check();
  await buyer.getByRole("button", { name: "Generate receipt code", exact: true }).click();
  const code = (
    await buyer.getByLabel("One-time receipt code", { exact: true }).innerText()
  ).trim();
  assert.match(code, /^\d{6}$/);
  await partner.getByLabel("Buyer receipt code", { exact: true }).fill(code);
  assert.equal(
    await partner
      .getByRole("button", { name: "Verify code and complete", exact: true })
      .isEnabled(),
    false,
  );
  await partner.getByRole("checkbox").check();
  await partner.getByRole("button", { name: "Verify code and complete", exact: true }).click();
  await partner.getByRole("heading", { name: "Available shop pickups", exact: true }).waitFor();
  const report = await fetch(api + "/__qa/report").then((r) => r.json());
  const order = report.orders.find((o) => o.id === fixture.orderId);
  assert.equal(order.subOrders[0].status, "delivered");
  assert.equal(order.subOrders[0].cashRecordedCents, 2500);
  assert.deepEqual(errors, []);
  assert.equal(
    await partner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  await mkdir("docs/delivery-verification", { recursive: true });
  await partner.screenshot({
    path: "docs/delivery-verification/mobile-completed.png",
    fullPage: true,
  });
  await writeFile(
    "docs/delivery-verification/browser-report.json",
    JSON.stringify(
      {
        isolated: true,
        checks: [
          "available list has no customer address",
          "partner claims ready task",
          "active task reveals saved address",
          "contact action and real map pin link",
          "seller confirms pickup before dispatch",
          "partner dispatches",
          "buyer issues receipt after cash/receipt confirmations",
          "partner confirms exact COD and code",
          "cash stored once and task released",
          "390px no overflow",
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log("11 isolated mobile delivery journey checks passed.");
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
