import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const isolation = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
assert.equal(isolation.isolated, true);
const b = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  p = await (await b.newContext({ viewport: { width: 1672, height: 1100 } })).newPage(),
  checks = [],
  errors = [],
  writes = [],
  dir = "docs/reports-verification";
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (!["GET", "OPTIONS"].includes(r.method()) && !r.url().includes("__qa")) writes.push(r.url());
});
const fit = async () =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
try {
  await mkdir(dir, { recursive: true });
  await p.goto("http://localhost:8083/__qa/bootstrap/admin", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/reports");
  await p.getByRole("region", { name: "Report metrics", exact: true }).waitFor();
  const session = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
  );
  const from = await p.getByLabel("From date (IST)").inputValue(),
    to = await p.getByLabel("To date (IST)").inputValue();
  const data = await (
    await p.request.get(`http://localhost:4001/admin/reports?from=${from}&to=${to}`, {
      headers: { Authorization: "Bearer " + session.token },
    })
  ).json();
  assert.equal(data.orders.count, 1);
  assert.equal(
    await p
      .locator(".reports-metrics article")
      .filter({ hasText: "Orders created" })
      .locator("strong")
      .textContent(),
    String(data.orders.count),
  );
  assert.equal(
    await p
      .locator(".reports-metrics article")
      .filter({ hasText: "Original booked value" })
      .locator("strong")
      .textContent(),
    "₹25",
  );
  assert.equal(await p.getByRole("link", { name: "Reports & analytics", exact: true }).count(), 1);
  await fit();
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("enabled report route/nav; counts/paise formatting match actual isolated API");
  await p.getByText("View daily data table", { exact: true }).click();
  await p.getByRole("columnheader", { name: "Date (IST)", exact: true }).waitFor();
  checks.push("daily chart has accessible exact data table");
  await p.getByLabel("From date (IST)").fill("2020-01-01");
  await p.getByLabel("To date (IST)").fill("2020-01-03");
  await p.getByRole("button", { name: "Apply dates", exact: true }).click();
  await p.getByText("No live orders were created in this range.", { exact: true }).waitFor();
  await p.screenshot({ path: dir + "/empty-desktop.png", fullPage: true });
  checks.push("actual date range with genuine zero metrics, no invented activity");
  await p.getByLabel("To date (IST)").fill("2020-12-31");
  await p.getByRole("button", { name: "Apply dates", exact: true }).click();
  await p.getByRole("heading", { name: "Could not load report", exact: true }).waitFor();
  assert.equal(await p.getByLabel("To date (IST)").inputValue(), "2020-12-31");
  assert.equal(await p.getByRole("region", { name: "Report metrics", exact: true }).count(), 0);
  await p.getByRole("button", { name: "Last 30 days", exact: true }).click();
  await p.getByRole("region", { name: "Report metrics", exact: true }).waitFor();
  checks.push(
    "server rejects >90 days; retains dates; stale metrics hidden; reset restores report",
  );
  for (const width of [768, 390, 320]) {
    await p.setViewportSize({ width, height: 1000 });
    await fit();
    await p.getByRole("region", { name: /Daily order chart/ }).focus();
    await p.screenshot({ path: dir + `/mobile-${width}.png`, fullPage: true });
    checks.push(`${width}px metrics/chart/table fit overall page; chart keyboard-focusable`);
  }
  await p.route("**/admin/reports?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "QA_DOWN", message: "QA report unavailable" }),
    }),
  );
  await p.getByRole("button", { name: "Refresh report", exact: true }).click();
  await p.getByRole("heading", { name: "Could not load report", exact: true }).waitFor();
  await p.unroute("**/admin/reports?**");
  await p.getByRole("button", { name: "Retry report", exact: true }).click();
  await p.getByRole("region", { name: "Report metrics", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  checks.push("error/retry recovers; no browser errors or write/provider requests");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ isolated: true, physicalDevice: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (e) {
  await p.screenshot({ path: dir + "/failure.png", fullPage: true });
  console.log(
    await p.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll("main *")]
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          right: Math.round(el.getBoundingClientRect().right),
          width: Math.round(el.getBoundingClientRect().width),
        }))
        .filter((x) => x.right > innerWidth + 1)
        .slice(0, 12),
    })),
  );
  throw e;
} finally {
  await b.close();
}
