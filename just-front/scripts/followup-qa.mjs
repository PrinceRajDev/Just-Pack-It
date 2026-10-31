const gpsAddressLabel = `GPS confirmed QA Home ${Date.now()}`;
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  output = "docs/followup-qa",
  steps = [],
  errors = [];
assert.equal(
  (await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let stage = "GPS address";
let observed;
async function pageFor(role) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 26, longitude: 86, accuracy: 20 },
    permissions: ["geolocation"],
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(u.hostname) && ["8083", "4001"].includes(u.port)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(role ? `${base}/__qa/bootstrap/${role}` : `${base}/login`);
  if (role) await page.waitForURL((url) => !url.pathname.startsWith("/__qa"));
  await page.waitForLoadState("networkidle");
  return page;
}
try {
  const buyer = await pageFor("buyer");
  observed = buyer;
  await buyer
    .getByRole("region", { name: "Shopping area" })
    .getByRole("button", { name: "Use my location · within 6 km", exact: true })
    .click();
  const dialog = buyer.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Where should your bag arrive?" }).waitFor();
  await dialog.getByLabel("Address label", { exact: true }).fill(gpsAddressLabel);
  await dialog
    .getByLabel("House, street and landmark", { exact: true })
    .fill("QA DEMO house beside test landmark");
  for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
  await dialog.getByRole("button", { name: "Confirm and save address" }).click();
  await buyer.getByRole("button", { name: "Address saved · review", exact: true }).waitFor();
  steps.push("GPS opens address confirmation; explicit buyer confirmation saves an owned address");
  await buyer
    .getByRole("link", { name: /QA DEMO Grocery/ })
    .first()
    .click();
  await buyer.locator('a[href="/shop/qa-demo-counter-1"]').first().click();
  await buyer.getByRole("link", { name: "QA DEMO Rice", exact: true }).first().click();
  await buyer
    .locator("label")
    .filter({ has: buyer.getByRole("radio", { name: /500 g, ₹25/ }) })
    .click();
  await buyer
    .getByRole("region", { name: "Quick add to bag" })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  stage = "buyer cancellation";
  await buyer.locator('header a[href="/cart"]').click();
  await buyer.getByRole("link", { name: "Review address and methods", exact: true }).click();
  await buyer.getByRole("radio", { name: new RegExp(gpsAddressLabel) }).check();
  await buyer
    .getByRole("radio", { name: "Choose Store pickup for QA DEMO Counter 1", exact: true })
    .check();
  await buyer.locator('[aria-label="COD confirmation and recovery"]').getByRole("checkbox").check();
  await buyer.getByRole("button", { name: "Place COD order · ₹25", exact: true }).click();
  await buyer.waitForURL(/\/orders\/[0-9a-f-]+/);
  await buyer.getByRole("button", { name: "Cancel this shop’s items" }).click();
  await buyer.getByLabel("Cancellation reason").fill("QA DEMO changed plans");
  await buyer.getByRole("checkbox", { name: "I want to cancel this shop’s part." }).check();
  await buyer.getByRole("button", { name: "Confirm shop cancellation" }).click();
  await buyer.getByText("Status: cancelled · Store pickup", { exact: true }).waitFor();
  await buyer.getByText("Current COD amount due: ₹0", { exact: true }).waitFor();
  assert.ok(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await buyer.screenshot({ path: `${output}/cancelled-mobile.png`, fullPage: true });
  steps.push(
    "Buyer cancels one shop before preparation; status and current COD due refresh on mobile",
  );
  stage = "admin operations";
  const admin = await pageFor("admin");
  await admin.goto(base + "/admin");
  await admin.getByRole("heading", { name: "What needs attention" }).waitFor();
  assert.equal(await admin.getByText("No items currently flagged.", { exact: true }).count(), 5);
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await admin.screenshot({ path: `${output}/operations-mobile.png`, fullPage: true });
  steps.push("Admin overview renders all five honest empty attention queues and fits mobile");
  stage = "recovery unavailable";
  const guest = await pageFor();
  await guest.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await guest.getByLabel("Verified email address").fill("qa@example.test");
  await guest.getByRole("button", { name: "Request recovery code", exact: true }).click();
  await guest
    .getByRole("alert")
    .filter({ hasText: "Email verification is not configured yet" })
    .waitFor();
  assert.equal(await guest.getByLabel("Six-digit recovery code").count(), 0);
  steps.push("Unconfigured Brevo prevents recovery and shows no fake email/reset success");
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ verified: true, steps, errors }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, steps }));
} catch (error) {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ verified: false, stage, error: String(error), steps, errors }, null, 2),
  );
  console.error(stage, String(error));
  if (observed) {
    console.log((await observed.locator("body").innerText()).slice(-10000));
    await observed.screenshot({ path: `${output}/failure.png`, fullPage: true });
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
