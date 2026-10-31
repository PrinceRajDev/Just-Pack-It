import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const f = await fetch("http://localhost:4001/__qa/finance").then((r) => r.json());
assert.equal(f.isolated, true);
assert.equal(f.providerDisabled, true);
const browser = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  context = await browser.newContext({ viewport: { width: 1672, height: 1100 } }),
  p = await context.newPage(),
  checks = [],
  errors = [],
  writes = [],
  dir = "docs/finance-redesign-verification";
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (
    r.method() !== "GET" &&
    r.method() !== "OPTIONS" &&
    /\/(settlements|admin\/payments|admin\/refunds)/.test(r.url())
  )
    writes.push(r.url());
});
const fit = async () =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const close = async () => {
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
};
try {
  await mkdir(dir, { recursive: true });
  await p.goto("http://localhost:8083/__qa/bootstrap/admin");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/finance");
  await p.getByRole("button", { name: "View settlement details", exact: true }).waitFor();
  await p.getByRole("button", { name: "Inspect payment", exact: true }).waitFor();
  await fit();
  assert.equal(await p.getByText("Global reporting unavailable", { exact: true }).count(), 4);
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("actual isolated API records and four unavailable global metrics; desktop bounds");
  const part = p.getByLabel("Shop-order part ID (optional)", { exact: true });
  await part.fill("invalid");
  assert.equal(
    await p.getByRole("button", { name: "Find settlement record", exact: true }).isEnabled(),
    false,
  );
  await part.fill(f.partId.toUpperCase());
  await p.getByRole("button", { name: "Find settlement record", exact: true }).click();
  await p.getByRole("button", { name: "View settlement details", exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear ledger lookup", exact: true }).click();
  assert.equal(await part.inputValue(), "");
  checks.push("exact part UUID lookup validates, normalizes and clears");
  await p.getByRole("button", { name: "View settlement details", exact: true }).click();
  let d = p.getByRole("dialog");
  await d
    .getByText("Financial proof is incomplete; amounts are not assumed.", { exact: true })
    .waitFor();
  assert.equal(
    await d
      .getByRole("button", { name: "Review proofs and post collection", exact: true })
      .isEnabled(),
    false,
  );
  await d.getByText("External payout recorded: Not recorded", { exact: true }).waitFor();
  await p.screenshot({ path: dir + "/ledger-details.png" });
  await close();
  checks.push(
    "ledger details show missing financial proof and no recorded payout; posting disabled",
  );
  await p.getByLabel("Payment state", { exact: true }).selectOption("paid");
  await p.getByRole("heading", { name: "No matching online payments", exact: true }).waitFor();
  await p.getByLabel("Payment state", { exact: true }).selectOption("uncertain");
  await p.getByRole("button", { name: "Inspect payment", exact: true }).waitFor();
  await p.getByLabel("Payment mode", { exact: true }).selectOption("live");
  await p.getByRole("heading", { name: "No matching online payments", exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear payment filters", exact: true }).click();
  await p.getByRole("button", { name: "Inspect payment", exact: true }).waitFor();
  checks.push("real payment state and test/live filters; clear resets cursor/filter");
  await p.getByRole("button", { name: "Inspect payment", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByText("₹123.45", { exact: true }).waitFor();
  await d.getByText(/TEST — no real payment/).waitFor();
  await d.getByText(/Razorpay is disabled/).waitFor();
  assert.equal(
    await d
      .getByRole("button", { name: "Verify mapping & recheck capture", exact: true })
      .isEnabled(),
    false,
  );
  await d.getByText("QA DEMO refund counter", { exact: true }).waitFor();
  await d
    .getByRole("status")
    .filter({ hasText: /Refund requested.*12\.34/ })
    .first()
    .waitFor();
  assert.equal(
    await d.getByRole("button", { name: "Submit confirmed refund", exact: true }).isEnabled(),
    false,
  );
  await p.screenshot({ path: dir + "/payment-details.png", fullPage: true });
  await close();
  checks.push(
    "payment paise and refund rupees formatting, actual requested refund, test/account/provider safety guards",
  );
  const shop = p.getByLabel("Shop ID (optional)", { exact: true });
  await shop.fill("bad");
  assert.equal(
    await p.getByRole("button", { name: "Filter reconciliation", exact: true }).isEnabled(),
    false,
  );
  await shop.fill("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await p.getByRole("button", { name: "Filter reconciliation", exact: true }).click();
  await p
    .getByRole("heading", { name: "No matching reconciliation records", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Clear reconciliation filters", exact: true }).click();
  await p
    .getByRole("cell", { name: /QA DEMO finance counter/ })
    .last()
    .waitFor();
  checks.push("reconciliation UUID filter/empty/clear retain distinct allocations");
  await part.fill("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await p.getByRole("button", { name: "Find settlement record", exact: true }).click();
  await p.getByRole("heading", { name: "No settlement records found", exact: true }).waitFor();
  await p.getByLabel("Payment mode", { exact: true }).selectOption("live");
  await p.getByRole("heading", { name: "No matching online payments", exact: true }).waitFor();
  await p.screenshot({ path: dir + "/empty-desktop.png", fullPage: true });
  await p.getByRole("button", { name: "Clear ledger lookup", exact: true }).click();
  await p.getByRole("button", { name: "Clear payment filters", exact: true }).click();
  await p.getByRole("button", { name: "Inspect payment", exact: true }).waitFor();
  await p.getByRole("button", { name: "View settlement details", exact: true }).waitFor();
  checks.push("actual API empty ledger and online payment views, refresh/clear restores records");
  for (const w of [768, 390, 320]) {
    await p.setViewportSize({ width: w, height: 900 });
    await fit();
    await p.screenshot({ path: dir + `/mobile-${w}.png`, fullPage: true });
    await p.getByRole("button", { name: "Inspect payment", exact: true }).click();
    await p.waitForTimeout(600);
    const box = await p.getByRole("dialog").boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= w + 1);
    await p.screenshot({ path: dir + `/payment-${w}.png` });
    await close();
    await p.getByRole("button", { name: "View settlement details", exact: true }).click();
    await p.waitForTimeout(600);
    const ledgerBox = await p.getByRole("dialog").boundingBox();
    assert.ok(ledgerBox.x >= -1 && ledgerBox.x + ledgerBox.width <= w + 1);
    await close();
    checks.push(`${w}px financial cards and both drawers fit; keyboard closes`);
  }
  await p.route("**/admin/payments?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "QA_FAILURE", message: "QA payments unavailable" }),
    }),
  );
  await p.getByRole("button", { name: "Refresh payments", exact: true }).click();
  await p.getByText("QA payments unavailable", { exact: true }).waitFor();
  await p.unroute("**/admin/payments?**");
  await p.getByRole("button", { name: "Try again", exact: true }).click();
  await p.getByRole("button", { name: "Inspect payment", exact: true }).waitFor();
  checks.push("payment list failure/retry, no invented empty data");
  await p.route("**/settlements?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "QA_FAILURE", message: "QA ledger unavailable" }),
    }),
  );
  await p.getByRole("button", { name: "Refresh settlement ledger", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "Could not refresh the ledger" }).waitFor();
  await p.unroute("**/settlements?**");
  await p.getByRole("button", { name: "Refresh settlement ledger", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Could not refresh the ledger" })
    .waitFor({ state: "hidden" });
  checks.push("ledger failed refresh/retry preserves records and recovers");
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  checks.push("no page errors or financial mutation/provider requests");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify(
      { isolated: true, providerDisabled: true, physicalDevice: false, checks },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (e) {
  await p.screenshot({ path: dir + "/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
