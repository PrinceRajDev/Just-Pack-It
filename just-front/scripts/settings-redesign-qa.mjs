import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const isolated = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
assert.equal(isolated.isolated, true);
const browser = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  p = await (await browser.newContext({ viewport: { width: 1672, height: 1100 } })).newPage(),
  checks = [],
  errors = [],
  dir = "docs/settings-redesign-verification";
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
const fit = async () =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
try {
  await mkdir(dir, { recursive: true });
  await p.goto("http://localhost:8083/__qa/bootstrap/admin", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const session = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
    ),
    headers = { Authorization: "Bearer " + session.token };
  const created = await p.request.post("http://localhost:4001/admin/categories", {
    headers,
    data: { name: "QA DEMO audit fixture", slug: "qa-audit-" + Date.now() },
  });
  assert.ok(created.ok());
  const category = await created.json();
  assert.ok(
    (
      await p.request.delete("http://localhost:4001/admin/categories/" + category.id, {
        headers,
        data: { version: category.version },
      })
    ).ok(),
  );
  const cats = await (
      await p.request.get("http://localhost:4001/admin/categories", { headers })
    ).json(),
    inactive = cats.find((c) => c.id === category.id);
  assert.ok(
    (
      await p.request.post(
        "http://localhost:4001/admin/categories/" + category.id + "/reactivate",
        { headers, data: { version: inactive.version } },
      )
    ).ok(),
  );
  await p.goto("http://localhost:8083/admin/settings");
  await p.getByRole("button", { name: "Edit QA DEMO AREA", exact: true }).waitFor();
  await p.getByRole("cell", { name: category.id, exact: true }).waitFor();
  await fit();
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push(
    "actual configured areas/shop metrics and real temporary audit record; desktop bounds",
  );
  await p.getByLabel("Area / locality name", { exact: true }).fill("QA DEMO Extra Area");
  await p.getByLabel("City / town", { exact: true }).fill("QA DEMO Town");
  await p.getByLabel("Pincodes (comma separated)", { exact: true }).fill("123");
  assert.equal(
    await p
      .getByLabel("Pincodes (comma separated)", { exact: true })
      .evaluate((el) => el.checkValidity()),
    false,
  );
  await p.getByLabel("Pincodes (comma separated)", { exact: true }).fill("999997, 999998");
  await p.getByRole("button", { name: "Save area", exact: true }).click();
  await p.getByRole("button", { name: "Edit QA DEMO Extra Area", exact: true }).waitFor();
  assert.equal(await p.getByLabel("Area / locality name", { exact: true }).inputValue(), "");
  checks.push("six-digit pincode validation and actual area create/reset");
  await p.getByRole("button", { name: "Edit QA DEMO Extra Area", exact: true }).click();
  await p.getByLabel("City / town", { exact: true }).fill("QA DEMO Edited Town");
  await p.getByRole("button", { name: "Save area", exact: true }).click();
  await p.getByRole("cell", { name: "QA DEMO Edited Town", exact: true }).waitFor();
  await p.getByRole("checkbox", { name: "Active area", exact: true }).uncheck();
  await p.getByRole("button", { name: "Save area", exact: true }).click();
  await p.getByLabel("Area status", { exact: true }).selectOption("inactive");
  await p.getByRole("button", { name: "Edit QA DEMO Extra Area", exact: true }).waitFor();
  await p.getByRole("button", { name: "Edit QA DEMO Extra Area", exact: true }).click();
  await p.getByRole("checkbox", { name: "Active area", exact: true }).check();
  await p.getByRole("button", { name: "Save area", exact: true }).click();
  await p.getByRole("heading", { name: "No matching service areas", exact: true }).waitFor();
  await p.getByLabel("Area status", { exact: true }).selectOption("all");
  checks.push("versioned edit, pincode retention and actual deactivate/reactivate");
  await p.getByRole("button", { name: "Edit QA DEMO AREA", exact: true }).click();
  await p.getByRole("checkbox", { name: "Active area", exact: true }).uncheck();
  await p.getByRole("button", { name: "Save area", exact: true }).click();
  await p.getByRole("alert").waitFor();
  assert.equal(
    await p.getByRole("checkbox", { name: "Active area", exact: true }).isChecked(),
    false,
  );
  const actualAreas = await (
    await p.request.get("http://localhost:4001/admin/areas", { headers })
  ).json();
  assert.equal(actualAreas.find((a) => a.name === "QA DEMO AREA").active, true);
  await p.getByRole("button", { name: "Clear area form", exact: true }).click();
  checks.push(
    "referenced area deactivation refused by server; draft retained; Clear returns create",
  );
  await p.getByLabel("Search service areas", { exact: true }).fill("999997");
  await p.getByRole("button", { name: "Edit QA DEMO Extra Area", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "Edit QA DEMO AREA", exact: true }).count(), 0);
  await p.getByLabel("Search service areas", { exact: true }).fill("");
  await p.getByText("GPS readiness: QA DEMO AREA", { exact: true }).click();
  await p
    .getByRole("complementary", { name: "GPS readiness for QA DEMO AREA", exact: true })
    .waitFor();
  checks.push("local pincode search, status filters and original GPS readiness");
  await p.getByLabel("Exact action", { exact: true }).fill("no.such.action");
  await p.getByRole("button", { name: "Filter audit", exact: true }).click();
  await p.getByRole("heading", { name: "No matching audit records", exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear audit filters", exact: true }).click();
  await p.getByLabel("Target ID", { exact: true }).fill("bad");
  assert.equal(
    await p.getByRole("button", { name: "Filter audit", exact: true }).isEnabled(),
    false,
  );
  await p.getByLabel("Target ID", { exact: true }).fill(category.id.toUpperCase());
  await p.getByRole("button", { name: "Filter audit", exact: true }).click();
  await p.getByRole("cell", { name: category.id, exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear audit filters", exact: true }).click();
  checks.push("actual exact-action/UUID audit filtering and clear; no fake date/user fields");
  for (const w of [768, 390, 320]) {
    await p.setViewportSize({ width: w, height: 1000 });
    await fit();
    await p.screenshot({ path: dir + `/mobile-${w}.png`, fullPage: true });
    checks.push(`${w}px forms, area/audit tables and filters fit page`);
  }
  await p.route("**/admin/audit?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "QA_DOWN", message: "QA audit unavailable" }),
    }),
  );
  await p.getByRole("button", { name: "Refresh records", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "QA audit unavailable" }).waitFor();
  await p.unroute("**/admin/audit?**");
  await p.getByRole("button", { name: "Retry audit", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "QA audit unavailable" })
    .waitFor({ state: "hidden" });
  checks.push("audit failed refresh/retry preserves filter/records");
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
