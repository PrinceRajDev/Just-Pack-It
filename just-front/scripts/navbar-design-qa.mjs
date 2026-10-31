import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:8081/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2000);
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.locator(".market-navbar").evaluate((header) =>
      [...header.querySelectorAll("a,button,input")]
        .filter((el) => el.getClientRects().length && el.closest(".header-category-nav") === null)
        .some((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1;
        }),
    );
    if (overflow) throw new Error(`Navbar overflow at ${width}`);
    await page.locator(".market-navbar").screenshot({ path: `docs/navbar-${width}.png` });
    console.log(width, "controls fit");
  }
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Choose delivery area" })
    .filter({ visible: true })
    .click();
  await page.getByText("Where should we deliver?", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  const search = page.getByRole("search").filter({ visible: true });
  await search.getByRole("textbox", { name: "Search products" }).fill("samosa");
  await search.getByRole("button", { name: "Search products" }).click();
  await page.waitForURL("**/search?q=samosa");
  const bag = page.getByRole("link", { name: /^Bag,/ });
  await bag.click();
  await page.waitForURL("**/cart");
  console.log("Location popover, search submission and cart navigation passed.");
} finally {
  await browser.close();
}
