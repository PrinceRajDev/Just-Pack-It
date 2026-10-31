import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright-core");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
  dir = "docs/payment-recovery-verification";
const outcome = process.env.QA_BANK_OUTCOME || "Failure";
assert.ok(["Success", "Failure"].includes(outcome));
async function api(p, path, body, headers = {}) {
  return p.evaluate(
    async ({ path, body, headers }) => {
      const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
      const r = await fetch("http://localhost:4001" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + s.token,
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: r.status === 204 ? null : await r.json() };
    },
    { path, body, headers },
  );
}
try {
  await mkdir(dir, { recursive: true });
  await page.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await page.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const fixture = await fetch("http://localhost:4001/__qa/payment").then((r) => r.json());
  assert.equal(fixture.isolated, true);
  assert.equal(fixture.testOnly, true);
  const report = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
  let id = report.orders[0]?.id;
  if (!id) {
    const made = await api(page, "/payments/razorpay/orders", fixture.input, {
      "Idempotency-Key": crypto.randomUUID(),
    });
    assert.equal(made.status, 200);
    assert.equal(made.body.testMode, true);
    id = made.body.orderId;
  }
  const before = await api(page, "/payments/razorpay/orders/" + id);
  assert.equal(before.body.testMode, true);
  assert.equal(before.body.state, "ready");
  await page.goto("http://localhost:8083/orders/" + id);
  await page.getByRole("button", { name: "Pay securely with Razorpay", exact: true }).click();
  const frame = page.frameLocator("iframe.razorpay-checkout-frame");
  await frame.getByPlaceholder("Mobile number", { exact: true }).fill("9000090000");
  await page.waitForTimeout(1200);
  if (await frame.getByText("Continue", { exact: true }).count())
    await frame.getByText("Continue", { exact: true }).click();
  await frame.getByText("Netbanking", { exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await frame.getByText("Canara Bank", { exact: true }).first().click();
  const popup = await popupPromise;
  await popup.getByText("Success", { exact: true }).waitFor();
  assert.equal(new URL(popup.url()).hostname, "api.razorpay.com");
  await popup.screenshot({ path: dir + "/mock-bank-" + outcome.toLowerCase() + ".png" });
  await popup.getByText(outcome, { exact: true }).click();
  await page.waitForTimeout(5000);
  let reconciled;
  for (let i = 0; i < 5; i++) {
    reconciled = await api(page, "/payments/razorpay/orders/" + id + "/reconcile", {});
    if (outcome === "Failure" || reconciled.body.paymentStatus === "paid") break;
    await page.waitForTimeout(2000);
  }
  assert.equal(reconciled.status, 200);
  assert.equal(reconciled.body.paymentStatus, outcome === "Success" ? "paid" : "unpaid");
  await page.reload();
  await page.getByRole("region", { name: "Online payment status" }).waitFor();
  await page.screenshot({ path: dir + "/after-" + outcome.toLowerCase() + ".png" });
  const result = {
    isolated: true,
    actualRazorpayTestGateway: true,
    realFundsMoved: false,
    orderId: id,
    providerOrderId: before.body.providerOrderId,
    outcome,
    paymentStatus: reconciled.body.paymentStatus,
    stockAfter: (await fetch("http://localhost:4001/__qa/report").then((r) => r.json())).products[0]
      .variants[0].stock,
  };
  await writeFile(
    dir + "/test-" + outcome.toLowerCase() + ".json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  if (outcome === "Success" && process.env.QA_REFUND === "true") {
    const order = await api(page, "/orders/" + id),
      sub = order.body.subOrders[0];
    assert.equal(sub.status, "placed");
    const cancelled = await api(page, `/orders/${id}/suborders/${sub.id}/cancel`, {
      version: sub.version,
      reason: "Isolated Razorpay test refund audit",
    });
    assert.equal(cancelled.status, 204);
  }
} catch (error) {
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: dir + "/checkout-current.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
