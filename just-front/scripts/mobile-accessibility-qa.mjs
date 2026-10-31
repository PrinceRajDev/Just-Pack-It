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
  dir = "docs/mobile-verification",
  checks = [],
  errors = [];
const fixture = await fetch("http://localhost:4001/__qa/checkout").then((r) => r.json());
assert.equal(fixture.isolated, true);
async function start(width, height, mode = "granted") {
  const c = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 26, longitude: 86, accuracy: 20 },
    permissions: mode === "granted" ? ["geolocation"] : [],
  });
  await c.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  if (mode !== "granted")
    await c.addInitScript(
      (code) =>
        Object.defineProperty(navigator, "geolocation", {
          value: { getCurrentPosition: (_ok, no) => no({ code }) },
          configurable: true,
        }),
      mode === "denied" ? 1 : 3,
    );
  const p = await c.newPage();
  p.setDefaultTimeout(18000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001") || "null");
    return (
      s &&
      localStorage.getItem(
        `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${s.userId}:cart`,
      ) !== null
    );
  });
  return p;
}
async function noOverflow(p) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
async function space(p, l) {
  await l.focus();
  await p.keyboard.press("Space");
}
try {
  await mkdir(dir, { recursive: true });
  for (const mode of ["denied", "timeout"]) {
    const p = await start(320, 568, mode);
    await p.getByRole("button", { name: "Use my location · within 6 km", exact: true }).click();
    await p
      .getByRole("alert")
      .filter({ hasText: mode === "denied" ? "permission was denied" : "timed out" })
      .first()
      .waitFor();
    await noOverflow(p);
    checks.push("simulated GPS " + mode + " gives explicit manual fallback");
    await p
      .getByRole("region", { name: "Shopping area", exact: true })
      .getByRole("button", { name: "Choose delivery area", exact: true })
      .click();
    const area = p.getByRole("button", { name: "QA DEMO AREA, QA DEMO CITY", exact: false });
    await area.waitFor();
    const pop = area.locator("xpath=ancestor::*[@data-radix-popper-content-wrapper]");
    assert.ok(
      await pop.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.x >= -1 && r.right <= innerWidth + 1;
      }),
    );
    await space(p, area);
    await p.getByText("Shopping in QA DEMO AREA", { exact: true }).waitFor();
    await noOverflow(p);
    checks.push("320px bounded area picker selectable with keyboard after " + mode);
    await p.screenshot({ path: dir + "/gps-" + mode + ".png" });
    await p.context().close();
  }
  const p = await start(390, 844);
  await p.getByRole("button", { name: "Use my location · within 6 km", exact: true }).click();
  const dialog = p.getByRole("dialog");
  await dialog.waitFor();
  checks.push("simulated precise GPS finds eligible area and opens address confirmation");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .evaluate((e) => e.getBoundingClientRect().width),
    44,
  );
  for (let i = 0; i < 18; i++) {
    await p.keyboard.press("Tab");
    assert.ok(await dialog.evaluate((e) => e.contains(document.activeElement)));
  }
  checks.push("address dialog traps keyboard focus; close touch target 44px");
  await p.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await p
      .getByRole("button", { name: "Confirm delivery address", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  checks.push("Escape restores focus to address trigger");
  await p.getByRole("button", { name: "Confirm delivery address", exact: true }).click();
  await dialog.getByLabel("Address label", { exact: true }).fill("QA Phone");
  await dialog
    .getByLabel("House, street and landmark", { exact: true })
    .fill("QA DEMO Lane 2 entrance");
  await space(p, dialog.getByLabel(/I checked this address and pincode/));
  await dialog
    .getByLabel("House, street and landmark", { exact: true })
    .fill("QA DEMO Lane 3 entrance");
  assert.equal(await dialog.getByLabel(/I checked this address and pincode/).isChecked(), false);
  checks.push("address editing clears stale written confirmation");
  await p.setViewportSize({ width: 390, height: 360 });
  assert.ok(await dialog.evaluate((e) => e.getBoundingClientRect().height <= innerHeight));
  await noOverflow(p);
  checks.push(
    "short 390x360 viewport keeps address sheet scrollable (keyboard viewport simulation)",
  );
  await dialog.getByRole("button", { name: "Adjust on map", exact: true }).click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: /Map tiles could not load|Map imagery is taking too long/ })
    .waitFor();
  await dialog.getByRole("button", { name: "Hide map", exact: true }).click();
  checks.push("blocked map tiles leave coordinate/address form usable");
  await space(p, dialog.getByLabel(/I confirm this pin marks/));
  await space(p, dialog.getByLabel(/I checked this address and pincode/));
  const save = dialog.getByRole("button", { name: "Confirm and save address", exact: true });
  await save.focus();
  await p.keyboard.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "Address saved · review", exact: true }).waitFor();
  checks.push("keyboard-only address confirmation and save succeeds against isolated API");
  await p.setViewportSize({ width: 640, height: 360 });
  await noOverflow(p);
  checks.push("640x360 landscape page has no horizontal overflow");
  await p.context().close();
  const checkout = await start(360, 640);
  await checkout.evaluate((f) => {
    localStorage.setItem("jpi.area", f.areaId);
    const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")),
      a = f.products[0],
      b = f.products[1];
    localStorage.setItem(
      `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${s.userId}:cart`,
      JSON.stringify({
        [a.id + "::" + a.variants[0].id]: {
          productId: a.id,
          variantId: a.variants[0].id,
          qty: 1,
          acceptedPrice: a.variants[0].price,
        },
        [b.id]: { productId: b.id, qty: 1, acceptedPrice: b.price },
      }),
    );
  }, fixture);
  await checkout.goto("http://localhost:8083/checkout");
  await space(checkout, checkout.getByRole("radio", { name: /QA DEMO Home/ }));
  await space(
    checkout,
    checkout.getByRole("radio", { name: "Choose Store pickup for QA DEMO Counter 1", exact: true }),
  );
  await space(
    checkout,
    checkout.getByRole("radio", {
      name: "Choose Shop delivers for QA DEMO Counter 2",
      exact: true,
    }),
  );
  const place = checkout.getByRole("button", { name: "Place COD order · ₹95", exact: true });
  await place.waitFor();
  await noOverflow(checkout);
  await checkout.screenshot({ path: dir + "/mixed-checkout.png", fullPage: true });
  checks.push("360px mixed-shop pickup and seller delivery selection works with keyboard");
  await space(
    checkout,
    checkout.locator('[aria-label="COD confirmation and recovery"]').getByRole("checkbox"),
  );
  await place.focus();
  await checkout.keyboard.press("Enter");
  await checkout.waitForURL(/\/orders\//);
  const result = await fetch("http://localhost:4001/__qa/report").then((r) => r.json());
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].subOrders.length, 2);
  assert.equal(result.orders[0].totalCents, 9500);
  await noOverflow(checkout);
  checks.push("keyboard submit creates exactly one isolated COD order with two shop suborders");
  await checkout.screenshot({ path: dir + "/mobile-order.png", fullPage: true });
  await checkout.context().close();
  assert.deepEqual(errors, []);
  checks.push("no browser page errors");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify(
      {
        emulated: true,
        physicalDevice: false,
        geolocationSimulated: true,
        actualAndroidKeyboardTested: false,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
