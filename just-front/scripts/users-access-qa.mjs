import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const f = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
assert.equal(f.isolated, true);
const b = await chromium.launch({
    headless: true,
    executablePath:
      "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  }),
  p = await (await b.newContext({ viewport: { width: 1672, height: 1100 } })).newPage(),
  checks = [],
  errors = [],
  dir = "docs/users-access-verification";
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
const close = async () => {
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
};
try {
  await mkdir(dir, { recursive: true });
  const buyer = await (await b.newContext()).newPage();
  await buyer.goto("http://localhost:8083/__qa/bootstrap/buyer", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await buyer.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const old = await buyer.evaluate(() =>
    JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
  );
  await p.goto("http://localhost:8083/__qa/bootstrap/admin", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/admin/users");
  await p.getByRole("heading", { name: "People behind the market.", exact: true }).waitFor();
  await p.getByRole("button", { name: "Review account", exact: true }).first().waitFor();
  assert.equal(await p.getByRole("link", { name: "Users & roles", exact: true }).count(), 1);
  await p.screenshot({ path: dir + "/desktop.png", fullPage: true });
  checks.push("connected Users & roles route/sidebar and actual private account directory");
  await p.getByLabel("Account role", { exact: true }).selectOption("buyer");
  await p.getByRole("button", { name: "Review account", exact: true }).click();
  let d = p.getByRole("dialog");
  assert.equal(
    await d.getByRole("button", { name: "Block account", exact: true }).isEnabled(),
    false,
  );
  await d.getByLabel("Reason for access change").fill("QA DEMO verified account restriction");
  await d.getByRole("button", { name: "Block account", exact: true }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Keep it", exact: true }).click();
  await d.getByRole("button", { name: "Block account", exact: true }).waitFor();
  await d.getByRole("button", { name: "Block account", exact: true }).click();
  const changed = p.waitForResponse(
    (r) => r.url().endsWith("/access") && r.request().method() === "PATCH" && r.status() === 200,
  );
  await p.getByRole("button", { name: "Confirm access change", exact: true }).click();
  await changed;
  await p.locator(".users-drawer").waitFor({ state: "hidden" });
  assert.equal(
    (
      await p.request.get("http://localhost:4001/auth/me", {
        headers: { Authorization: "Bearer " + old.token },
      })
    ).status(),
    401,
  );
  checks.push("required reason, confirmation cancel/block and actual old-token rejection");
  await p.getByLabel("Account status", { exact: true }).selectOption("blocked");
  await p.getByRole("button", { name: "Review account", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByLabel("Reason for access change").fill("QA DEMO verified account restoration");
  await d.getByRole("button", { name: "Restore account", exact: true }).click();
  const restored = p.waitForResponse(
    (r) => r.url().endsWith("/access") && r.request().method() === "PATCH" && r.status() === 200,
  );
  await p.getByRole("button", { name: "Confirm access change", exact: true }).click();
  await restored;
  await p.locator(".users-drawer").waitFor({ state: "hidden" });
  await p.getByRole("heading", { name: "No matching accounts", exact: true }).waitFor();
  assert.equal(
    (
      await p.request.get("http://localhost:4001/auth/me", {
        headers: { Authorization: "Bearer " + old.token },
      })
    ).status(),
    401,
  );
  await buyer.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await buyer.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  const fresh = await buyer.evaluate(() =>
    JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
  );
  assert.equal(
    (
      await p.request.get("http://localhost:4001/auth/me", {
        headers: { Authorization: "Bearer " + fresh.token },
      })
    ).status(),
    200,
  );
  await buyer.close();
  checks.push(
    "actual restoration does not revive old sessions; fresh login succeeds; blocked filter empty",
  );
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  await p.getByLabel("Account role", { exact: true }).selectOption("admin");
  await p.getByRole("button", { name: "Review account", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByText(/Admin accounts and your own account are protected/).waitFor();
  assert.equal(await d.getByRole("button", { name: "Block account", exact: true }).count(), 0);
  await close();
  checks.push("admin/self protected and no role mutation controls");
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  await p.getByLabel("Search accounts", { exact: true }).fill("no-such-qa-account");
  await p.getByRole("button", { name: "Search", exact: true }).click();
  await p.getByRole("heading", { name: "No matching accounts", exact: true }).waitFor();
  await p.getByRole("button", { name: "Clear", exact: true }).click();
  await p.getByRole("button", { name: "Review account", exact: true }).first().waitFor();
  checks.push("server search/filter clear and truthful empty state");
  for (const w of [768, 390, 320]) {
    await p.setViewportSize({ width: w, height: 900 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: dir + `/mobile-${w}.png`, fullPage: true });
    await p.getByRole("button", { name: "Review account", exact: true }).first().click();
    await p.waitForTimeout(600);
    const box = await p.getByRole("dialog").boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= w + 1);
    await p.screenshot({ path: dir + `/detail-${w}.png` });
    await close();
    checks.push(`${w}px account cards and drawer fit; keyboard close`);
  }
  await p.route("**/admin/users?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "QA_DOWN", message: "QA users unavailable" }),
    }),
  );
  await p.getByRole("button", { name: "Refresh accounts", exact: true }).click();
  await p.getByRole("heading", { name: "Could not load accounts", exact: true }).waitFor();
  await p.unroute("**/admin/users?**");
  await p.getByRole("button", { name: "Retry accounts", exact: true }).click();
  await p.getByRole("button", { name: "Review account", exact: true }).first().waitFor();
  checks.push("load failure/retry and no browser page errors");
  assert.deepEqual(errors, []);
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
