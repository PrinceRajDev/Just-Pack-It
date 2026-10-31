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
  dir = "docs/mobile-auth-verification",
  checks = [],
  errors = [];
async function fit(p) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(
    await p.locator(".login-form-panel > div").evaluate((e) => {
      const b = e.getBoundingClientRect();
      return b.left >= 0 && b.right <= innerWidth + 1;
    }),
  );
}
try {
  await mkdir(dir, { recursive: true });
  for (const width of [320, 390]) {
    const c = await browser.newContext({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    await c.route("**/*", (r) =>
      ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    const p = await c.newPage();
    p.setDefaultTimeout(18000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:8083/login");
    await p.waitForFunction(
      () =>
        localStorage.getItem(
          `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:guest:cart`,
        ) !== null,
    );
    await p.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    await fit(p);
    assert.equal(await p.getByLabel("Mobile number", { exact: true }).getAttribute("type"), "tel");
    assert.equal(
      await p.getByLabel("Password", { exact: true }).evaluate((e) => getComputedStyle(e).fontSize),
      "16px",
    );
    await p.screenshot({ path: dir + "/login-" + width + ".png", fullPage: true });
    checks.push(width + "px login fits; 16px fields and tel keyboard hint");
    await p.getByLabel("Password", { exact: true }).fill("QA-only-visible-password");
    await p.getByRole("button", { name: "Show password", exact: true }).click();
    await p.getByRole("button", { name: "Hide password", exact: true }).waitFor();
    assert.equal(await p.getByLabel("Password", { exact: true }).getAttribute("type"), "text");
    await p.getByRole("button", { name: "Hide password", exact: true }).click();
    await p.getByRole("button", { name: "Show password", exact: true }).waitFor();
    assert.equal(await p.getByLabel("Password", { exact: true }).getAttribute("type"), "password");
    await p.getByLabel("Password", { exact: true }).fill("");
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p
      .locator("#live-phone-error")
      .getByText(/valid mobile number/)
      .waitFor();
    assert.equal(
      await p
        .getByLabel("Mobile number", { exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    checks.push(width + "px password visibility and first invalid field focus work");
    await p.getByRole("button", { name: "New here? Create an account", exact: true }).click();
    await p.getByRole("button", { name: "Create buyer account", exact: true }).waitFor();
    await fit(p);
    assert.ok(
      await p
        .getByRole("radio", { name: /Buyer/ })
        .evaluate((e) => e.getBoundingClientRect().width <= 20),
    );
    await p.screenshot({ path: dir + "/buyer-signup-" + width + ".png", fullPage: true });
    checks.push(width + "px buyer signup fits; radios have native-sized controls");
    const seller = p.getByRole("radio", { name: /Seller/ });
    await seller.focus();
    await p.keyboard.press("Space");
    await p.getByLabel("Shop name", { exact: true }).waitFor();
    await p.getByRole("button", { name: "Create account and submit shop", exact: true }).waitFor();
    await fit(p);
    assert.ok(
      await p
        .getByRole("checkbox", { name: "QA DEMO Grocery", exact: true })
        .evaluate((e) => e.getBoundingClientRect().height <= 20),
    );
    assert.equal(
      await p
        .getByLabel("Full shop address", { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
      "16px",
    );
    await p.screenshot({ path: dir + "/seller-signup-" + width + ".png", fullPage: true });
    checks.push(
      width + "px seller shop fields, categories, area, photo and submit stay within screen",
    );
    await p.setViewportSize({ width: 640, height: 360 });
    await fit(p);
    await p
      .getByRole("button", { name: "Create account and submit shop", exact: true })
      .scrollIntoViewIfNeeded();
    assert.ok(
      await p
        .getByRole("button", { name: "Create account and submit shop", exact: true })
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    checks.push(width + "px session: landscape seller submit remains reachable");
    await p.getByRole("button", { name: "Already have an account? Sign in", exact: true }).click();
    await p.setViewportSize({ width, height: 360 });
    await p.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await p.getByLabel("Verified email address", { exact: true }).waitFor();
    await fit(p);
    await p.getByLabel("Verified email address", { exact: true }).focus();
    await p.keyboard.type("qa@example.invalid");
    assert.equal(
      await p.getByLabel("Verified email address", { exact: true }).inputValue(),
      "qa@example.invalid",
    );
    await p.getByRole("button", { name: "Back to sign in", exact: true }).click();
    checks.push(width + "px short viewport recovery form usable without sending email");
    await c.close();
  }
  assert.deepEqual(errors, []);
  checks.push("no page errors; no real account registration/email/payment invoked");
  await writeFile(
    dir + "/browser-report.json",
    JSON.stringify({ emulated: true, physicalDevice: false, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
