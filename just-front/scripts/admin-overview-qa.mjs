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
  dir = "docs/admin-overview-verification",
  checks = [],
  errors = [];
const c = await browser.newContext({ viewport: { width: 1672, height: 1000 } });
await c.route("**/*", (r) =>
  ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
    ? r.continue()
    : r.abort(),
);
const p = await c.newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
async function api(path, body) {
  return p.evaluate(
    async ({ path, body }) => {
      const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
      const r = await fetch("http://localhost:4001" + path, {
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
  await p.goto("http://localhost:8083/admin");
  await p.getByRole("heading", { name: "Marketplace operations", exact: true }).waitFor();
  await p.getByText("Connected", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Refresh data", exact: true }).waitFor();
  await fit();
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  console.log("DESKTOP_READY");
  const snapshot = await api("/admin/operations");
  assert.equal(snapshot.status, 200);
  assert.equal(
    await p
      .getByRole("link", {
        name: `Shop approvals: ${snapshot.data.pendingShops.count}. Open workspace`,
      })
      .count(),
    1,
  );
  assert.equal(
    await p
      .getByRole("link", {
        name: `Orders to check: ${snapshot.data.staleSuborders.count}. Open workspace`,
      })
      .count(),
    1,
  );
  await p
    .getByText("Orders today, active users, and GMV are not available in this overview.", {
      exact: true,
    })
    .waitFor();
  checks.push("queue counts match the operations API and unsupported reporting is disclosed");
  assert.equal(await p.getByText("All systems operational", { exact: true }).count(), 0);
  assert.equal(await p.getByText("Not checked", { exact: true }).count(), 2);
  checks.push("API/database checked; provider health unknown, never fabricated");
  const nav = p.locator("aside").getByRole("navigation", { name: "Ops navigation" }),
    links = await nav
      .getByRole("link")
      .evaluateAll((es) =>
        es.map((e) => ({ href: e.getAttribute("href"), name: e.textContent.trim() })),
      );
  assert.deepEqual(links.map(({ href }) => href).sort(), [
    "/admin",
    "/admin/catalog",
    "/admin/finance",
    "/admin/orders",
    "/admin/partners",
    "/admin/platform",
    "/admin/reports",
    "/admin/settings",
    "/admin/support",
    "/admin/users",
  ]);
  for (const l of links) {
    await nav.getByRole("link", { name: l.name, exact: true }).click();
    await p.waitForURL((u) => u.pathname === l.href);
    assert.notEqual(new URL(p.url()).pathname, "/login");
  }
  checks.push("all ten sidebar destinations navigate under admin guard");
  await p.goto("http://localhost:8083/admin");
  await p.getByRole("heading", { name: "Marketplace operations", exact: true }).waitFor();
  const search = p.getByRole("searchbox", { name: "Search admin workspaces" });
  await search.fill("orders");
  await p
    .locator(".admin-search-results")
    .getByRole("link", { name: /Orders/ })
    .click();
  await p.waitForURL((u) => u.pathname === "/admin/orders");
  checks.push("header workspace search navigates to existing order screen");
  await p.goto("http://localhost:8083/admin");
  await p.getByRole("heading", { name: "Marketplace operations", exact: true }).waitFor();
  const listing = (await api("/admin/products")).data.items[0];
  assert.ok(listing);
  const blocked = await api(`/admin/products/${listing.id}/moderation`, {
    version: listing.version,
    blocked: true,
    reason: "Isolated dashboard audit",
  });
  assert.equal(blocked.status, 200);
  await p.getByRole("button", { name: "Refresh data", exact: true }).click();
  await p.getByText("product block", { exact: true }).first().waitFor();
  await p.getByRole("tab", { name: "Catalogue", exact: true }).click();
  await p.getByText("product block", { exact: true }).first().waitFor();
  await p.getByRole("tab", { name: "Shop approvals", exact: true }).click();
  await p
    .getByText("No shop approvals actions in the latest audit page.", { exact: true })
    .waitFor();
  await p.getByRole("tab", { name: "All", exact: true }).click();
  checks.push("refresh fetches actual audit action; activity tabs filter with honest empty state");
  await api(`/admin/products/${listing.id}/moderation`, {
    version: blocked.data.version,
    blocked: false,
    reason: "Restore isolated QA listing after audit",
  });
  await p.getByRole("link", { name: "View audit log", exact: false }).first().click();
  await p.waitForURL((u) => u.pathname === "/admin/settings" && u.hash === "#admin-audit-log");
  await p.locator("#admin-audit-log").waitFor();
  checks.push("view audit log reaches existing explorer and anchor");
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 640],
  ]) {
    await p.setViewportSize({ width, height });
    await p.goto("http://localhost:8083/admin");
    await p.getByRole("heading", { name: "Marketplace operations", exact: true }).waitFor();
    await fit();
    if (width < 1024) {
      await p.getByRole("button", { name: "Open admin menu", exact: true }).click();
      const dialog = p.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByRole("link", { name: "Catalogue", exact: true }).click();
      await p.waitForURL((u) => u.pathname === "/admin/catalog");
      await dialog.waitFor({ state: "hidden" });
      await p.goto("http://localhost:8083/admin");
      await p.getByRole("heading", { name: "Marketplace operations", exact: true }).waitFor();
    }
    await p.screenshot({ path: dir + `/viewport-${width}.png`, fullPage: true });
    checks.push(width + "px layout has no horizontal overflow; available navigation works");
  }
  await p.route("**/admin/operations", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Isolated simulated outage" }),
    }),
  );
  await p.reload();
  await p.getByText("Could not load operations queues.", { exact: true }).waitFor();
  assert.equal(
    await p.getByRole("link", { name: "Shop approvals: Unavailable. Open workspace" }).count(),
    1,
  );
  await p.unroute("**/admin/operations");
  await p.getByRole("button", { name: "Retry operations", exact: true }).click();
  await p
    .getByRole("link", {
      name: `Shop approvals: ${snapshot.data.pendingShops.count}. Open workspace`,
    })
    .waitFor();
  checks.push("operations error shows unavailable rather than zero; retry recovers");

  const unread = await api("/notifications/unread-count");
  assert.equal(unread.status, 200);
  const bell = p.getByRole("button", {
    name: unread.data.count ? `Notifications, ${unread.data.count} unread` : "Notifications",
    exact: true,
  });
  await bell.click();
  await p.getByRole("heading", { name: "Your updates", exact: true }).waitFor();
  await p.getByRole("button", { name: "Close", exact: true }).click();
  checks.push("existing notification unread count matches API; notification drawer opens");
  await p.getByRole("button", { name: "Open admin menu", exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Sign out", exact: true }).click();
  await p.getByRole("heading", { name: "Please sign in", exact: true }).waitFor();
  checks.push("existing sign-out action still clears admin access");
  const buyerContext = await browser.newContext(),
    buyer = await buyerContext.newPage();
  await buyer.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await buyer.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await buyer.goto("http://localhost:8083/admin");
  await buyer
    .getByRole("heading", { name: "This area isn't for your account", exact: true })
    .waitFor();
  const denied = await buyer.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
    return (
      await fetch("http://localhost:4001/admin/operations", {
        headers: { Authorization: "Bearer " + s.token },
      })
    ).status;
  });
  assert.equal(denied, 403);
  await buyerContext.close();
  checks.push("buyer denied by existing frontend guard and backend operations authorization");
  assert.deepEqual(errors, []);
  checks.push("no browser page errors");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ isolated: true, physicalDevice: false, liveData: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
