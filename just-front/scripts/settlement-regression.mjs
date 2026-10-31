import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  api = "http://localhost:4001";
const fixture = await fetch(api + "/__qa/delivery").then((r) => r.json());
assert.equal(fixture.isolated, true);
const report = await fetch(api + "/__qa/report").then((r) => r.json());
assert.equal(report.orders.find((o) => o.id === fixture.orderId).subOrders[0].status, "delivered");
const browser = await chromium.launch({ headless: true }),
  contexts = [],
  errors = [];
async function login(role, path) {
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
  await p.goto(base + path);
  return p;
}
try {
  const admin = await login("admin", "/admin/finance");
  const ledger = admin.getByRole("region", {
    name: "Cash and seller settlement ledger",
    exact: true,
  });
  await ledger
    .getByRole("button", { name: "Review proofs and post collection", exact: true })
    .click();
  await ledger
    .getByText("Ledger: posted with balanced entries · Policy zero_commission_v1", { exact: true })
    .waitFor();
  assert.equal(
    await ledger.getByRole("button", { name: "Prepare manual payout intent", exact: true }).count(),
    0,
  );
  const partner = await login("delivery", "/delivery/earnings");
  const partnerLedger = partner.getByRole("region", {
    name: "Cash and seller settlement ledger",
    exact: true,
  });
  const handover = partnerLedger.getByRole("button", {
    name: "Submit cash handover acknowledgement",
    exact: true,
  });
  await handover.waitFor();
  assert.equal(await handover.isEnabled(), false);
  await partnerLedger.getByRole("checkbox").check();
  await handover.click();
  await partnerLedger.getByText(/partner says handed over; admin receipt pending/).waitFor();
  await ledger.getByRole("button", { name: "Refresh settlement ledger", exact: true }).click();
  await ledger
    .getByLabel("Unique cash receipt reference", { exact: true })
    .fill("QA-RECEIPT-" + fixture.id);
  const receive = ledger.getByRole("button", { name: "Record actual cash receipt", exact: true });
  assert.equal(await receive.isEnabled(), false);
  await ledger.getByRole("checkbox").check();
  await receive.click();
  await ledger.getByRole("button", { name: "Prepare manual payout intent", exact: true }).waitFor();
  await ledger.getByRole("checkbox").check();
  await ledger.getByRole("button", { name: "Prepare manual payout intent", exact: true }).click();
  await ledger
    .getByText(
      "Payout intent prepared. Transfer externally only once, after verifying the seller/payee.",
      { exact: true },
    )
    .waitFor();
  const payout = ledger.getByRole("button", {
    name: "Record completed manual payout",
    exact: true,
  });
  assert.equal(await payout.isEnabled(), false);
  await ledger
    .getByLabel("Unique bank/UPI transaction reference", { exact: true })
    .fill("QA-NO-REAL-TRANSFER-" + fixture.id);
  await ledger.getByRole("checkbox").check();
  await payout.click();
  await ledger
    .getByText("Manual payout recorded by admin — not bank/provider verified", { exact: true })
    .waitFor();
  assert.equal(
    await ledger.getByRole("button", { name: "Prepare manual payout intent", exact: true }).count(),
    0,
  );
  await ledger.getByRole("button", { name: "View journal entries", exact: true }).click();
  await ledger.getByText("Balanced sum: 0 paise", { exact: true }).first().waitFor();
  assert.equal(await ledger.getByText("Balanced sum: 0 paise", { exact: true }).count(), 3);
  const seller = await login("seller", "/seller/settlements");
  await seller
    .getByText("Manual payout recorded by admin — not bank/provider verified", { exact: true })
    .waitFor();
  await seller
    .getByText("Transfer reference: QA-NO-REAL-TRANSFER-" + fixture.id.toUpperCase(), {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await seller
      .getByRole("button", { name: /Prepare manual payout|Record completed|Record actual cash/ })
      .count(),
    0,
  );
  await partnerLedger
    .getByRole("button", { name: "Refresh settlement ledger", exact: true })
    .click();
  await partnerLedger.getByText(/admin receipt acknowledged/).waitFor();
  for (const p of [admin, partner, seller])
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    );
  assert.deepEqual(errors, []);
  await mkdir("docs/settlement-verification", { recursive: true });
  await admin.screenshot({
    path: "docs/settlement-verification/mobile-admin-ledger.png",
    fullPage: true,
  });
  await seller.screenshot({
    path: "docs/settlement-verification/mobile-seller-statement.png",
    fullPage: true,
  });
  await writeFile(
    "docs/settlement-verification/browser-report.json",
    JSON.stringify(
      {
        isolated: true,
        simulatedCashAndTransferAcknowledgements: true,
        realFundsMoved: false,
        checks: [
          "delivered COD proof source posted",
          "payout held before cash receipt",
          "partner actual-handover confirmation required",
          "admin receipt reference and cash-count confirmation required",
          "single intent prepared before external-transfer recording",
          "transfer reference and explicit actual-transfer acknowledgement required",
          "recorded state labelled not bank verified",
          "three balanced journals",
          "no second payout intent",
          "seller-owned statement/reference visible",
          "seller cannot write payouts",
          "partner sees receipt acknowledgement",
          "390px no overflow across three roles",
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "14 isolated settlement browser checks passed; cash/transfer acknowledgements simulated, no real funds moved.",
  );
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
