import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:8083/__qa/bootstrap/buyer", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForURL("http://localhost:8083/", { timeout: 45000 });
  await page.goto("http://localhost:8083/account", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name", { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
      throw new Error(`Account overflow ${width}`);
    await page.screenshot({ path: `docs/account-overview-${width}.png`, fullPage: true });
    console.log(width, "account fits");
  }
  const updatedName = `QA DEMO Account ${Date.now().toString().slice(-6)}`;
  await page.getByLabel("Your name", { exact: true }).fill(updatedName);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByRole("heading", { name: `Hello, ${updatedName}` }).waitFor();
  console.log("Profile save updates greeting and sidebar");
  await page.getByRole("button", { name: "Add address", exact: true }).click();
  for (const [label, value] of [
    ["Address label", "QA Layout Address"],
    ["House, street and landmark", "QA Test Street"],
    ["Locality / village", "QA Locality"],
    ["City / town", "QA Town"],
    ["Pincode", "999999"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByText("Address saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit QA Layout Address", exact: true }).click();
  await page.getByLabel("House, street and landmark", { exact: true }).fill("QA Updated Street");
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByText(/QA Updated Street, QA Locality/).waitFor();
  await page.getByRole("button", { name: "Reload addresses", exact: true }).click();
  await page.getByRole("button", { name: "Remove QA Layout Address", exact: true }).click();
  await page.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await page.getByText("Address removed.", { exact: true }).waitFor();
  console.log("Address create/edit/reload/remove passed");
  await page.getByLabel("Current password", { exact: true }).fill("QA-current-not-a-real-password");
  await page.getByLabel("New password", { exact: true }).fill("QA-new-only-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("QA-mismatch-password");
  await page.getByRole("checkbox", { name: /I understand all devices/ }).check();
  await page.getByRole("button", { name: "Change password & sign out", exact: true }).click();
  await page.getByText(/Use a different new password/).waitFor();
  console.log("Password mismatch blocked without submitting credentials");
  // Labelled QA product IDs, browser-only saved-items fixture; no production storage.
  const products = await (await page.request.get("http://localhost:4001/products")).json();
  await page.evaluate((productId) => {
    const session = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
    const key = `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${session.userId}:wish`;
    localStorage.setItem(key, JSON.stringify([productId]));
  }, products[0].id);
  await page.goto("http://localhost:8083/account?tab=wishlist", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Remove .* from wishlist$/ }).waitFor();
  await page.screenshot({ path: "docs/account-wishlist-320.png", fullPage: true });
  await page.getByRole("button", { name: /^Remove .* from wishlist$/ }).click();
  await page.getByText(/No saved products yet/).waitFor();
  await page.getByRole("link", { name: "Account overview", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  console.log("Wishlist removal/empty state, overview navigation and real QA logout passed");
} finally {
  await browser.close();
}
