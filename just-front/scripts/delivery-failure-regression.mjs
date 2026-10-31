import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  api = "http://localhost:4001";
const fixture = await fetch(api + "/__qa/delivery").then((r) => r.json());
assert.equal(fixture.isolated, true);
const before = await fetch(api + "/__qa/report").then((r) => r.json());
const beforeStock = before.products[0].variants[0].stock;
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
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/__qa/bootstrap/" + role);
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  return p;
}
try {
  const old = await login("delivery");
  await old.getByRole("button", { name: "Refresh tasks", exact: true }).waitFor();
  await old.waitForLoadState("networkidle");
  if (await old.getByRole("button", { name: "Claim task", exact: true }).count())
    await old.getByRole("button", { name: "Claim task", exact: true }).click();
  await old.getByRole("region", { name: "Active delivery", exact: true }).waitFor();
  const admin = await login("admin");
  const desk = admin.getByRole("region", { name: "Delivery exception desk", exact: true });
  await desk.getByLabel("Resolution action", { exact: true }).selectOption("release");
  await desk
    .getByLabel("Resolution reason", { exact: true })
    .fill("QA DEMO no-show, shop confirms goods still at counter");
  const save = desk.getByRole("button", { name: "Save delivery resolution", exact: true });
  assert.equal(await save.isEnabled(), false);
  await desk.getByRole("checkbox").check();
  await save.click();
  await desk.getByText("QA DEMO Counter 1 · unassigned", { exact: true }).waitFor();
  await old.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await old.getByRole("heading", { name: "Available shop pickups", exact: true }).waitFor();
  assert.equal(await old.getByRole("button", { name: "Claim task", exact: true }).count(), 0);
  const partner = await login("delivery2");
  await partner.getByRole("button", { name: "Claim task", exact: true }).click();
  await partner.getByRole("region", { name: "Active delivery", exact: true }).waitFor();
  const seller = await login("seller");
  await seller.getByLabel("Order status", { exact: true }).selectOption("ready");
  seller.on("dialog", (d) => d.accept());
  await seller
    .getByRole("button", { name: "Confirm goods handed to assigned partner", exact: true })
    .click();
  await partner.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await partner.getByRole("button", { name: "Start delivery", exact: true }).click();
  await partner.getByRole("button", { name: "Verify code and complete", exact: true }).waitFor();
  await partner.getByText("Report a delivery problem", { exact: true }).click();
  await partner
    .getByLabel("Problem details", { exact: true })
    .fill("QA DEMO buyer unreachable, goods need return");
  await partner.getByRole("button", { name: "Report issue", exact: true }).click();
  await partner.getByText(/Issue reported: QA DEMO buyer unreachable/).waitFor();
  await desk.getByRole("button", { name: "Refresh delivery exceptions", exact: true }).click();
  await desk.getByLabel("Resolution action", { exact: true }).selectOption("request_return");
  assert.equal(await desk.getByRole("option", { name: /Release for another partner/ }).count(), 0);
  await desk
    .getByLabel("Resolution reason", { exact: true })
    .fill("QA DEMO return to shop after failed delivery attempt");
  await desk.getByRole("button", { name: "Save delivery resolution", exact: true }).click();
  await desk.getByText(/Waiting for the owning shop/).waitFor();
  await partner.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await partner.getByText(/Return these goods to the shop/).waitFor();
  assert.equal(
    await partner.getByRole("button", { name: "Verify code and complete", exact: true }).count(),
    0,
  );
  const buyer = await login("buyer");
  await buyer.goto(base + "/orders/" + fixture.orderId);
  await buyer.getByText(/This delivery is being returned to the shop/).waitFor();
  assert.equal(
    await buyer.getByRole("button", { name: "Generate receipt code", exact: true }).count(),
    0,
  );
  await seller.getByLabel("Order status", { exact: true }).selectOption("out_for_delivery");
  await seller
    .getByLabel("I physically received all returned goods from the assigned partner.", {
      exact: true,
    })
    .check();
  await seller.getByLabel("Sellable stock decision", { exact: true }).selectOption("yes");
  await seller
    .getByLabel("Return receipt note", { exact: true })
    .fill("QA DEMO goods received and all items inspected sellable");
  await seller
    .getByRole("button", { name: "Confirm returned goods and cancel this part", exact: true })
    .click();
  await seller.getByText("No orders in this view.", { exact: true }).waitFor();
  await partner.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await partner.getByRole("heading", { name: "Available shop pickups", exact: true }).waitFor();
  const after = await fetch(api + "/__qa/report").then((r) => r.json());
  assert.equal(after.orders.find((o) => o.id === fixture.orderId).subOrders[0].status, "cancelled");
  assert.equal(after.products[0].variants[0].stock, beforeStock + 1);
  await buyer.getByRole("button", { name: "Refresh order status", exact: true }).click();
  await buyer
    .getByText("Cancellation reason: QA DEMO goods received and all items inspected sellable", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.equal(
    await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  await mkdir("docs/delivery-failure-verification", { recursive: true });
  await buyer.screenshot({
    path: "docs/delivery-failure-verification/mobile-cancelled.png",
    fullPage: true,
  });
  await writeFile(
    "docs/delivery-failure-verification/browser-report.json",
    JSON.stringify(
      {
        isolated: true,
        checks: [
          "admin goods-at-shop confirmation required",
          "pre-pickup task release",
          "old partner loses active access and cannot reclaim",
          "second partner claims same shop order",
          "seller pickup before dispatch",
          "partner reports failed attempt",
          "post-pickup admin return request only",
          "partner sees return instructions and cannot complete delivery",
          "buyer receipt control blocked during return",
          "seller physical receipt and stock decision required",
          "exact committed variant quantity restored once",
          "cancelled order and released partner",
          "buyer/admin390px no overflow",
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log("14 isolated delivery-failure browser checks passed.");
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
