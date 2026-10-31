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
const ctx = await browser.newContext(),
  page = await ctx.newPage(),
  dir = "docs/payment-recovery-verification";
async function api(p, path, body) {
  return p.evaluate(
    async ({ path, body }) => {
      const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
      const r = await fetch("http://localhost:4001" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.token },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: r.status === 204 ? null : await r.json() };
    },
    { path, body },
  );
}
try {
  const fixture = await fetch("http://localhost:4001/__qa/payment").then((r) => r.json());
  assert.equal(fixture.isolated, true);
  assert.equal(fixture.testOnly, true);
  const report = await fetch("http://localhost:4001/__qa/report").then((r) => r.json()),
    id = report.orders[0].id;
  assert.equal(report.orders[0].paymentStatus, "paid");
  await page.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await page.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const order = await api(page, "/orders/" + id);
  assert.equal(order.body.testMode, true);
  const sub = order.body.subOrders[0];
  if (sub.status !== "cancelled") {
    assert.equal(
      process.env.QA_REFUND_SUBMIT,
      "true",
      "Explicit opt-in required for cancellation/refund submission",
    );
    const cancelled = await api(page, `/orders/${id}/suborders/${sub.id}/cancel`, {
      version: sub.version,
      reason: "Isolated Razorpay test refund audit",
    });
    assert.equal(cancelled.status, 204);
  }
  const admin = await ctx.newPage();
  await admin.goto("http://localhost:8083/__qa/bootstrap/admin");
  await admin.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  let rows = await api(admin, `/admin/payments/${id}/refunds`);
  assert.equal(rows.status, 200);
  assert.equal(rows.body.length, 1);
  assert.equal(rows.body[0].testMode, true);
  assert.equal(rows.body[0].amount, 25);
  let final = { status: 200, body: rows.body[0] },
    duplicateSubmissionSameRefund = false;
  if (process.env.QA_REFUND_SUBMIT === "true") {
    const submitted = await api(admin, `/admin/refunds/${sub.id}/submit`, { confirmRefund: true });
    if (submitted.status === 200) {
      assert.ok(submitted.body.providerRefundId);
      const repeat = await api(admin, `/admin/refunds/${sub.id}/submit`, { confirmRefund: true });
      assert.equal(repeat.status, 200);
      assert.equal(repeat.body.providerRefundId, submitted.body.providerRefundId);
      duplicateSubmissionSameRefund = true;
      final = repeat;
      for (let i = 0; i < 5 && final.body.state === "pending"; i++) {
        await page.waitForTimeout(2000);
        final = await api(admin, `/admin/refunds/${sub.id}/reconcile`, {});
        assert.equal(final.status, 200);
      }
    } else {
      rows = await api(admin, `/admin/payments/${id}/refunds`);
      final = { status: submitted.status, body: rows.body[0] };
    }
  }
  const refundId = final.body.providerRefundId;
  await page.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await page.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await page.goto("http://localhost:8083/orders/" + id);
  await page.getByRole("region", { name: "Online payment status" }).waitFor();
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: dir + "/buyer-refund.png", fullPage: true });
  const result = {
    isolated: true,
    actualRazorpayTestGateway: true,
    realFundsMoved: false,
    orderId: id,
    suborderId: sub.id,
    providerRefundId: refundId,
    state: final.body.state,
    amount: final.body.amount,
    duplicateSubmissionSameRefund,
    verifiedProcessed: final.body.state === "processed",
    submissionAttempted: process.env.QA_REFUND_SUBMIT === "true",
    submissionHttpStatus: process.env.QA_REFUND_SUBMIT === "true" ? final.status : null,
    stockAfter: (await fetch("http://localhost:4001/__qa/report").then((r) => r.json())).products[0]
      .variants[0].stock,
  };
  assert.equal(result.stockAfter, 5);
  await writeFile(dir + "/test-refund.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
