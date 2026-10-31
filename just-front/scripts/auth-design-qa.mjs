import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  const page = await browser.newPage();
  await page.route("**/auth/registration-options", (route) =>
    route.fulfill({ json: { emailOtpRequired: true, emailOtpAvailable: false } }),
  );
  await page.route("**/categories", (route) =>
    route.fulfill({
      json: [
        { id: "11111111-1111-4111-8111-111111111111", name: "QA category", subcategories: [] },
      ],
    }),
  );
  await page.route("**/areas", (route) =>
    route.fulfill({
      json: [
        { id: "22222222-2222-4222-8222-222222222222", name: "QA area", pincodes: [], active: true },
      ],
    }),
  );
  await page.goto("http://localhost:8081/login", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByLabel("Password", { exact: true }).waitFor();
  // SSR fields appear before React has attached interaction handlers.
  await page.waitForTimeout(1500);
  for (const mode of ["login", "buyer", "seller"]) {
    if (mode === "buyer") {
      await page.getByRole("button", { name: "New here? Create an account" }).click();
      await page.getByRole("radio", { name: /Buyer/ }).waitFor();
    }
    if (mode === "seller") await page.getByRole("radio", { name: /Seller/ }).check();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await page.screenshot({ path: `docs/auth-${mode}-${width}.png`, fullPage: true });
      const bounds = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      if (bounds.content > width + 1) throw new Error(`${mode} overflow at ${width}`);
      console.log(mode, width, "no overflow");
    }
  }
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await page.getByRole("button", { name: "Show password" }).click();
  if ((await page.getByLabel("Password", { exact: true }).getAttribute("type")) !== "text")
    throw new Error("Password toggle failed");
  await page.getByRole("button", { name: "Hide password" }).click();
  console.log(
    "Mode switching and password visibility passed. No accounts created or OTP emails sent; setup responses intercepted for visual QA.",
  );
} finally {
  await browser.close();
}
