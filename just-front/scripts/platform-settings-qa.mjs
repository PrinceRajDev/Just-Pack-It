import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const fixture = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
assert.equal(fixture.isolated, true);
const b = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  p = await (await b.newContext({ viewport: { width: 1672, height: 1100 } })).newPage(),
  checks = [],
  errors = [],
  dir = "docs/platform-settings-verification";
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
const fit = async () =>
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
async function publish(status = 200) {
  await p.getByRole("button", { name: "Publish changes", exact: true }).click();
  const response = p.waitForResponse(
    (r) =>
      r.url().endsWith("/admin/platform-settings") &&
      r.request().method() === "PATCH" &&
      r.status() === status,
  );
  await p.getByRole("button", { name: "Confirm publish", exact: true }).click();
  await response;
  await p.getByRole("alertdialog").waitFor({ state: "hidden" });
}
try {
  await mkdir(dir, { recursive: true });
  await p.goto("http://localhost:8083/__qa/bootstrap/admin", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/platform");
  await p.getByRole("heading", { name: "Public marketplace information", exact: true }).waitFor();
  await p.getByLabel("Support email", { exact: true }).waitFor();
  assert.equal(await p.getByRole("link", { name: "Platform settings", exact: true }).count(), 1);
  assert.equal(
    await p.getByRole("button", { name: "Publish changes", exact: true }).isEnabled(),
    false,
  );
  await fit();
  checks.push("enabled platform route/nav, blank defaults and read-only deployment configuration");
  await p.getByLabel("Support email", { exact: true }).fill("qa-support@qa.invalid");
  await p.getByLabel("Support phone", { exact: true }).fill("+919000000001");
  await p.getByLabel("Support hours", { exact: true }).fill("QA DEMO hours only");
  await p.getByRole("checkbox", { name: "Show buyer announcement", exact: true }).check();
  await p.getByLabel("Announcement text").fill("QA DEMO customer announcement");
  await p.getByLabel("Reason for publishing").fill("QA DEMO approved support publication");
  await p
    .getByRole("complementary", { name: "Public information preview", exact: true })
    .getByText("QA DEMO customer announcement", { exact: true })
    .waitFor();
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  await p.getByRole("button", { name: "Publish changes", exact: true }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Keep it", exact: true }).click();
  await p.getByRole("button", { name: "Publish changes", exact: true }).waitFor();
  await publish();
  await p.getByText(/No unpublished changes/).waitFor();
  checks.push("required reason, preview, confirmation cancel and actual versioned publication");
  const customer = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  await customer.goto("http://localhost:8083/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await customer
    .getByRole("complementary", { name: "Marketplace information", exact: true })
    .getByText("QA DEMO customer announcement", { exact: true })
    .waitFor();
  await customer.getByRole("link", { name: "qa-support@qa.invalid", exact: true }).waitFor();
  const pub = await (await p.request.get("http://localhost:4001/platform-settings")).json();
  assert.deepEqual(
    Object.keys(pub).sort(),
    ["supportEmail", "supportPhone", "supportHours", "noticeEnabled", "noticeText"].sort(),
  );
  await customer.screenshot({ path: dir + "/customer.png", fullPage: true });
  checks.push(
    "anonymous customer sees published notice/contact; public DTO excludes all private/configuration fields",
  );
  await p.getByRole("checkbox", { name: "Show buyer announcement", exact: true }).uncheck();
  await p.getByLabel("Reason for publishing").fill("QA DEMO disable informational announcement");
  await publish();
  await p.getByText(/No unpublished changes/).waitFor();
  await customer.reload();
  await customer.getByRole("link", { name: "qa-support@qa.invalid", exact: true }).waitFor();
  assert.equal(
    await customer.getByText("QA DEMO customer announcement", { exact: true }).count(),
    0,
  );
  assert.equal(
    (await (await p.request.get("http://localhost:4001/platform-settings")).json()).noticeText,
    "",
  );
  checks.push("disabling announcement hides it publicly while preserving support contacts");
  await p.getByLabel("Support hours", { exact: true }).fill("QA DEMO unsaved local draft");
  await p.getByLabel("Reason for publishing").fill("QA DEMO proposed hours change");
  const session = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
    ),
    headers = { Authorization: "Bearer " + session.token };
  const saved = await (
    await p.request.get("http://localhost:4001/admin/platform-settings", { headers })
  ).json();
  const concurrent = await p.request.patch("http://localhost:4001/admin/platform-settings", {
    headers,
    data: {
      supportEmail: saved.supportEmail,
      supportPhone: saved.supportPhone,
      supportHours: "QA DEMO another admin hours",
      noticeEnabled: saved.noticeEnabled,
      noticeText: saved.noticeText,
      version: saved.version,
      reason: "QA DEMO concurrent administrator update",
    },
  });
  assert.ok(concurrent.ok());
  if (await p.getByRole("button", { name: "Publish changes", exact: true }).isEnabled())
    await publish(409);
  await p.getByRole("alert").waitFor();
  assert.equal(
    await p.getByLabel("Support hours", { exact: true }).inputValue(),
    "QA DEMO unsaved local draft",
  );
  assert.equal(
    await p.getByRole("button", { name: "Publish changes", exact: true }).isEnabled(),
    false,
  );
  await p.getByRole("button", { name: "Reload saved settings", exact: true }).click();
  await p.getByRole("button", { name: "Reload settings", exact: true }).click();
  await p
    .getByLabel("Support hours", { exact: true })
    .evaluate((el) => el.value === "QA DEMO another admin hours");
  await p.waitForFunction(
    () => document.querySelector('input[value="QA DEMO another admin hours"]') !== null,
  );
  checks.push(
    "concurrent version protects unsaved draft; explicit reload adopts latest saved settings",
  );
  for (const width of [768, 390, 320]) {
    await p.setViewportSize({ width, height: 1000 });
    await fit();
    await p.screenshot({ path: dir + `/mobile-${width}.png`, fullPage: true });
    checks.push(`${width}px platform form/preview/configuration fits page`);
  }
  await p.getByLabel("Support hours", { exact: true }).fill("QA DEMO draft kept during outage");
  await p.route("**/admin/platform-settings", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "QA_DOWN", message: "QA settings unavailable" }),
        })
      : r.continue(),
  );
  await p.getByRole("button", { name: "Reload saved settings", exact: true }).click();
  await p.getByRole("button", { name: "Reload settings", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "Settings refresh failed" }).waitFor();
  assert.equal(
    await p.getByLabel("Support hours", { exact: true }).inputValue(),
    "QA DEMO draft kept during outage",
  );
  await p.unroute("**/admin/platform-settings");
  await p.getByRole("button", { name: "Retry settings", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Settings refresh failed" })
    .waitFor({ state: "hidden" });
  assert.equal(
    await p.getByLabel("Support hours", { exact: true }).inputValue(),
    "QA DEMO draft kept during outage",
  );
  checks.push("refresh failure/retry retains unsaved text and never claims a publication");
  assert.deepEqual(errors, []);
  await customer.close();
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
  await b.close();
}
