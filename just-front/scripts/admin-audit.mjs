const runId = Date.now().toString();
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
assert.equal(
  (await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
const browser = await chromium.launch({ headless: true }),
  results = [],
  errors = [];
await mkdir("docs/admin-audit", { recursive: true });
const routes = [
  ["/admin", "What needs attention"],
  ["/admin/partners", "Sellers and shop approvals"],
  ["/admin/orders", "Orders & cash records"],
  ["/admin/catalog", "Marketplace taxonomy"],
  ["/admin/finance", "Online payments & reconciliation"],
  ["/admin/support", "Order support"],
  ["/admin/settings", "Service areas"],
];
try {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.route("**/*", (r) =>
      ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:8083/__qa/bootstrap/admin");
    await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
    for (const [route, title] of routes) {
      await p.goto("http://localhost:8083" + route);
      await p.getByRole("heading", { name: title, exact: true }).waitFor();
      await p.waitForLoadState("networkidle");
      assert.equal(await p.getByRole("alert").count(), 0, route + " unexpected error");
      assert.ok(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        route + " overflow " + width,
      );
      await p.screenshot({
        path: `docs/admin-audit/${route.split("/").pop() || "overview"}-${width}.png`,
        fullPage: true,
      });
      results.push({ route, width, status: "pass" });
    }
    await p.goto("http://localhost:8083/admin/support/");
    await p.getByRole("heading", { name: "Order support", exact: true }).waitFor();
    results.push({ route: "/admin/support/", width, status: "pass" });
    if (width === 390) {
      await p.getByRole("button", { name: "Open menu", exact: true }).click();
      const nav = p.getByRole("navigation", { name: "Ops navigation" });
      await nav.getByRole("link", { name: "Service areas", exact: true }).click();
      await p.getByRole("heading", { name: "Service areas", exact: true }).waitFor();
      assert.equal(await p.getByRole("dialog").count(), 0);
      results.push({ route: "mobile menu navigation", width, status: "pass" });
    }
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }),
      p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    await p.goto("http://localhost:8083/__qa/bootstrap/admin");
    await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
    await p.goto("http://localhost:8083/admin/catalog");
    await p
      .getByLabel("Category name", { exact: true })
      .first()
      .fill(`QA AUDIT disposable category ${runId}`);
    await p.getByLabel("URL slug", { exact: true }).first().fill(`qa-audit-category-${runId}`);
    await p.getByRole("button", { name: "Save category", exact: true }).first().click();
    await p
      .getByRole("heading", { name: `QA AUDIT disposable category ${runId}`, exact: true })
      .waitFor();
    results.push({ action: "create persisted category", status: "pass" });
    await p.goto("http://localhost:8083/admin/settings");
    await p
      .getByLabel("Area / locality name", { exact: true })
      .first()
      .fill(`QA AUDIT disposable area ${runId}`);
    await p.getByLabel("City / town", { exact: true }).first().fill("QA AUDIT city");
    await p.getByLabel("Pincodes (comma separated)", { exact: true }).first().fill("999998");
    await p.getByRole("button", { name: "Save area", exact: true }).first().click();
    await p
      .getByRole("heading", { name: `QA AUDIT disposable area ${runId}`, exact: true })
      .waitFor();
    results.push({ action: "create persisted service area", status: "pass" });
    await p.goto("http://localhost:8083/admin/partners");
    await p.getByLabel(/Application status/).selectOption("all");
    await p
      .getByLabel(/Approval decision/)
      .first()
      .selectOption("pending");
    const response = p.waitForResponse(
      (r) => r.url().includes("/approval") && r.request().method() === "PATCH",
    );
    await p.getByRole("button", { name: "Save decision", exact: true }).first().click();
    assert.equal((await response).status(), 200);
    results.push({ action: "persist versioned shop approval", status: "pass" });
    for (const [path, title, endpoint] of [
      ["/admin", "What needs attention", "/admin/operations"],
      ["/admin/catalog", "Marketplace taxonomy", "/admin/categories"],
      ["/admin/support", "Order support", "/support?"],
    ]) {
      const pattern = "**/*";
      const handler = (route) =>
        route.request().url().includes(endpoint)
          ? route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ message: "QA simulated failure", code: "QA_FAILURE" }),
            })
          : route.continue();
      await p.route(pattern, handler);
      await p.goto("http://localhost:8083" + path);
      await p.getByRole("alert").first().waitFor();
      await p.unroute(pattern, handler);
      await p
        .getByRole("button", {
          name:
            path === "/admin"
              ? "Retry operations"
              : path === "/admin/support"
                ? "Refresh tickets"
                : /try again/i,
        })
        .first()
        .click();
      await p.getByRole("heading", { name: title, exact: true }).waitFor();
      await p.waitForLoadState("networkidle");
      assert.equal(await p.getByRole("alert").count(), 0);
      results.push({ action: path + " API failure and recovery", status: "pass" });
    }
    await ctx.close();
  }
  for (const role of ["buyer", "seller"]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`http://localhost:8083/__qa/bootstrap/${role}`);
    await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
    await p.goto("http://localhost:8083/admin");
    await p.getByRole("heading", { name: "This area isn't for your account" }).waitFor();
    results.push({ role, status: "admin access blocked" });
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ verified: true, results, errors }));
  await writeFile(
    "docs/admin-audit/report.json",
    JSON.stringify({ verified: true, results, errors }, null, 2),
  );
} catch (e) {
  console.error(String(e));
  await writeFile(
    "docs/admin-audit/report.json",
    JSON.stringify({ verified: false, results, errors, error: String(e) }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
