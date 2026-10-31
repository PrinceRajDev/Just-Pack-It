import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright-core");
const browser = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  dir = "docs/seller-approvals-verification",
  checks = [],
  errors = [];
const c = await browser.newContext({ viewport: { width: 1672, height: 1000 } }),
  p = await c.newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
async function api(path, body) {
  return p.evaluate(
    async ({ path, body }) => {
      const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
        r = await fetch("http://localhost:4001" + path, {
          method: body === undefined ? "GET" : "PATCH",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.token },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      return { status: r.status, data: await r.json() };
    },
    { path, body },
  );
}
async function fit() {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
try {
  await mkdir(dir, { recursive: true });
  await p.goto("http://localhost:8083/__qa/bootstrap/admin");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const original = (await api("/admin/shops")).data;
  assert.equal(original.length, 2);
  let target = original[0];
  await api(`/admin/shops/${target.id}/approval`, { version: target.version, status: "pending" });
  await p.goto("http://localhost:8083/admin/partners");
  await p.getByRole("tab", { name: "Pending (1)", exact: true }).waitFor();
  const sellers = (await api("/admin/sellers")).data;
  assert.equal(
    await p
      .getByRole("button", { name: /Total sellers/ })
      .locator("strong")
      .innerText(),
    String(sellers.length),
  );
  await fit();
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("actual seller count and pending/approved counts match isolated APIs");
  await p.getByRole("tab", { name: "Pending (1)", exact: true }).click();
  const row = p.getByRole("row").filter({ hasText: target.name });
  await row.getByRole("button", { name: "Approve", exact: true }).click();
  await p.getByRole("dialog").waitFor();
  await p.getByRole("button", { name: "Review and save decision", exact: true }).click();
  await p.getByRole("alertdialog").waitFor();
  assert.equal((await api("/admin/shops")).data.find((s) => s.id === target.id).status, "pending");
  await p.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p.getByRole("tab", { name: "Approved (2)", exact: true }).waitFor();
  checks.push(
    "approval changes only after confirmation and actual backend response; counts refresh",
  );
  await p.getByRole("tab", { name: "Approved (2)", exact: true }).click();
  await p
    .getByRole("row")
    .filter({ hasText: target.name })
    .getByRole("button", { name: "View details", exact: true })
    .click();
  const drawer = p.getByRole("dialog");
  await drawer.getByLabel("Approval decision").selectOption("rejected");
  const reason = drawer.getByLabel(/Reason for seller/);
  await reason.fill("QA audit: address requires review");
  await drawer.getByRole("button", { name: "Review and save decision", exact: true }).click();
  await p.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await drawer.waitFor({ state: "hidden" });
  await p.getByRole("tab", { name: "Rejected (1)", exact: true }).waitFor();
  assert.equal(
    (await api("/admin/shops")).data.find((s) => s.id === target.id).review.reason,
    "QA audit: address requires review",
  );
  checks.push("rejection reason is saved server-side and rejected count updates");
  await p.getByRole("tab", { name: "All (2)", exact: true }).click();
  const owner = sellers.find((s) => s.id === target.ownerId);
  await p.getByRole("searchbox", { name: "Search applications", exact: true }).fill(owner.name);
  await p
    .getByText(
      "1 matching · 2 total shop submissions. Status counts cover the complete loaded list.",
      { exact: true },
    )
    .waitFor();
  await p.getByRole("searchbox", { name: "Search applications", exact: true }).fill("missing-shop");
  await p.getByRole("heading", { name: "No matching applications", exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear all filters", exact: true }).click();
  await p.getByLabel("Sort by").selectOption("za");
  const names = await p
    .locator(".seller-application-table tbody tr td:first-child strong")
    .allTextContents();
  assert.deepEqual(names, [...names].sort().reverse());
  checks.push("owner search, no-results reset and Z–A sorting work");
  await p.getByRole("button", { name: "Filters", exact: true }).click();
  const cat = p.locator(".seller-filter-popover select").nth(0);
  await cat.selectOption(target.categoryIds[0]);
  await p.locator(".seller-filter-popover select").nth(1).selectOption(target.serviceAreaIds[0]);
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Filters · applied", exact: true }).waitFor();
  checks.push("category and service-area filters use actual configured IDs");
  for (const [width, height] of [
    [768, 1024],
    [390, 844],
    [320, 640],
  ]) {
    await p.setViewportSize({ width, height });
    await fit();
    await p.screenshot({ path: dir + `/mobile-${width}.png`, fullPage: true });
    const card = p.locator(".seller-application-cards li").filter({ hasText: target.name });
    await card.getByRole("button", { name: "View details", exact: true }).click();
    await p.getByRole("dialog").waitFor();
    await p.getByRole("dialog").evaluate(async (e) => {
      await Promise.all(e.getAnimations().map((a) => a.finished.catch(() => {})));
    });
    assert.ok(
      await p
        .getByRole("dialog")
        .evaluate(
          (e) =>
            e.getBoundingClientRect().width <= innerWidth &&
            e.getBoundingClientRect().left >= -1 &&
            e.getBoundingClientRect().right <= innerWidth + 1,
        ),
    );
    await p.screenshot({ path: dir + `/details-${width}.png`, fullPage: true });
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    checks.push(width + "px cards and review drawer fit; Escape closes");
  }
  await p.route("**/admin/shops*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "QA simulated failure" }),
    }),
  );
  await p.reload();
  await p.getByText("Shop submissions could not be refreshed.", { exact: true }).waitFor();
  assert.equal(await p.getByRole("heading", { name: "No shop submissions yet" }).count(), 0);
  await p.unroute("**/admin/shops*");
  await p.getByRole("button", { name: "Retry applications", exact: true }).click();
  await p.getByRole("tab", { name: "All (2)", exact: true }).waitFor();
  checks.push("failed load shows retry rather than fake empty/zero");
  await p.route("**/admin/shops*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await p.reload();
  await p.getByRole("heading", { name: "No shop submissions yet", exact: true }).waitFor();
  await p.screenshot({ path: dir + "/empty-mobile.png", fullPage: true });
  await p.setViewportSize({ width: 1672, height: 1000 });
  await p.screenshot({ path: dir + "/empty-desktop.png", fullPage: true });
  await p.unroute("**/admin/shops*");
  await p.getByRole("button", { name: "Refresh data", exact: true }).first().click();
  await p.getByRole("tab", { name: "All (2)", exact: true }).waitFor();
  checks.push("empty illustration is data-driven; refresh restores API list");
  const latest = (await api("/admin/shops")).data.find((s) => s.id === target.id);
  await api(`/admin/shops/${target.id}/approval`, {
    version: latest.version,
    status: target.status,
  });
  assert.deepEqual(errors, []);
  checks.push("no page errors; isolated approval restored");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ isolated: true, physicalDevice: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
