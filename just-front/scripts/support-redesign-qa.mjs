import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  checks = [],
  errors = [],
  dir = "docs/support-redesign-verification";
const p = await (await browser.newContext({ viewport: { width: 1672, height: 1100 } })).newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
const close = async () => {
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
};
const fit = async () =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
try {
  await mkdir(dir, { recursive: true });
  const report = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
  assert.equal(report.isolated, true);
  const orderId = report.orders[0].id;
  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await buyer.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const buyerSession = await buyer.evaluate(() =>
    JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
  );
  const orderResponse = await buyer.request.get("http://localhost:4001/orders/" + orderId, {
    headers: { Authorization: "Bearer " + buyerSession.token },
  });
  assert.ok(orderResponse.ok());
  const order = await orderResponse.json();
  const created = await buyer.request.post("http://localhost:4001/support", {
    headers: { Authorization: "Bearer " + buyerSession.token },
    data: {
      orderId,
      suborderId: order.subOrders[0].id,
      kind: "other",
      description: "QA DEMO support redesign isolated issue",
    },
  });
  assert.ok(created.ok() || created.status() === 409, String(created.status()));
  await buyer.close();
  await p.goto("http://localhost:8083/__qa/bootstrap/admin");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/support");
  await p.getByRole("button", { name: "View ticket", exact: true }).waitFor();
  await fit();
  assert.equal(
    await p.locator(".support-metrics article").first().locator("strong").textContent(),
    "1",
  );
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("actual buyer-created isolated ticket and scoped loaded counts; desktop layout");
  await p.getByRole("button", { name: "View ticket", exact: true }).click();
  let d = p.getByRole("dialog");
  await d.getByRole("link", { name: "View order" }).waitFor();
  assert.ok(
    (await d.getByRole("link", { name: "View order" }).getAttribute("href")).includes(orderId),
  );
  assert.equal(
    await d.getByRole("button", { name: "Resolve ticket", exact: true }).isEnabled(),
    false,
  );
  await d.getByLabel("Buyer-visible update / resolution").fill("QA DEMO investigating buyer issue");
  await d.getByRole("button", { name: "Mark in progress", exact: true }).click();
  await d.getByText(/other · in progress/).waitFor();
  checks.push("order link, required buyer-visible note, persisted versioned in-progress update");
  await d
    .getByLabel("Buyer-visible update / resolution")
    .fill("QA DEMO resolution recorded, no refund implied");
  await d.getByRole("button", { name: "Resolve ticket", exact: true }).click();
  await d.getByLabel("Reason to reopen (at least 10 characters)").waitFor();
  await d
    .getByText("Resolution: QA DEMO resolution recorded, no refund implied", { exact: true })
    .waitFor();
  await d
    .getByLabel("Reason to reopen (at least 10 characters)")
    .fill("QA DEMO please review this issue again");
  await d.getByRole("button", { name: "Reopen ticket", exact: true }).click();
  await d.getByLabel("Your reply").waitFor();
  const phrase = `QA DEMO unique conversation phrase ${Date.now()}`;
  await d.getByLabel("Your reply").fill(phrase);
  await d.getByRole("button", { name: "Send reply", exact: true }).click();
  await d.locator("p").filter({ hasText: phrase }).waitFor();
  await p.screenshot({ path: dir + "/ticket-details.png" });
  await close();
  checks.push("actual resolution, reopen and persisted conversation reply");
  await p.getByLabel("Search support tickets", { exact: true }).fill("unique conversation phrase");
  await p.getByRole("button", { name: "Search tickets", exact: true }).click();
  await p.getByRole("button", { name: "View ticket", exact: true }).waitFor();
  await p.getByLabel("Ticket status", { exact: true }).selectOption("resolved");
  await p.getByRole("heading", { name: "No matching support tickets", exact: true }).waitFor();
  await p.screenshot({ path: dir + "/empty-desktop.png", fullPage: true });
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  await p.getByRole("button", { name: "View ticket", exact: true }).waitFor();
  checks.push("server conversation search/status filtering, actual empty view and clear");
  await p.getByRole("button", { name: "View ticket", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByLabel("Buyer-visible update / resolution").fill("QA DEMO draft kept after conflict");
  await p.route("**/support/*", (r) =>
    r.request().method() === "PATCH"
      ? r.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "VERSION_CONFLICT", message: "QA stale support version" }),
        })
      : r.continue(),
  );
  await d.getByRole("button", { name: "Resolve ticket", exact: true }).click();
  await d.getByRole("alert").filter({ hasText: "QA stale support version" }).waitFor();
  assert.equal(
    await d.getByLabel("Buyer-visible update / resolution").inputValue(),
    "QA DEMO draft kept after conflict",
  );
  await p.unroute("**/support/*");
  await close();
  checks.push("failed status update preserves resolution draft and shows server conflict");
  for (const w of [768, 390, 320]) {
    await p.setViewportSize({ width: w, height: 900 });
    await fit();
    await p.screenshot({ path: dir + `/mobile-${w}.png`, fullPage: true });
    await p.getByRole("button", { name: "View ticket", exact: true }).click();
    await p.waitForTimeout(600);
    d = p.getByRole("dialog");
    const box = await d.boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= w + 1);
    await d.getByLabel("Your reply").fill("QA DEMO unsent draft");
    await d.getByRole("button", { name: "Refresh conversation", exact: true }).click();
    assert.equal(await d.getByLabel("Your reply").inputValue(), "QA DEMO unsent draft");
    await p.screenshot({ path: dir + `/detail-${w}.png` });
    await close();
    checks.push(
      `${w}px ticket cards/drawer fit; conversation refresh retains reply; keyboard close`,
    );
  }
  await p.route("**/support?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "QA_UNAVAILABLE",
        message: "QA support temporarily unavailable",
      }),
    }),
  );
  await p.getByRole("button", { name: "Refresh tickets", exact: true }).click();
  await p.getByRole("heading", { name: "Could not load tickets", exact: true }).waitFor();
  assert.equal(await p.getByText("Count unavailable", { exact: true }).count(), 4);
  await p.unroute("**/support?**");
  await p.getByRole("button", { name: "Retry tickets", exact: true }).click();
  await p.getByRole("button", { name: "View ticket", exact: true }).waitFor();
  checks.push("list error is distinct from empty/zero counts; retry recovers");
  assert.deepEqual(errors, []);
  checks.push("no browser page errors");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ isolated: true, physicalDevice: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (e) {
  await p.screenshot({ path: dir + "/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
