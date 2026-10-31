import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  const page = await browser.newPage();
  for (const path of ["categories", "category/fast-food-snacks"]) {
    await page.goto(`http://localhost:8081/${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(2000);
    await page.getByRole("heading", { level: 1 }).waitFor();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      if (overflow) throw new Error(`${path} overflow at ${width}`);
      await page.screenshot({
        path: `docs/category-${path === "categories" ? "directory" : "detail"}-${width}.png`,
        fullPage: true,
      });
      console.log(path, width, "fits");
    }
    if (path === "categories") {
      await page.getByRole("textbox", { name: "Search categories" }).fill("no-category-qa-match");
      await page.getByRole("heading", { name: "No lanes match that search" }).waitFor();
      await page.getByRole("textbox", { name: "Search categories" }).fill("samosa");
      await page.locator(".category-directory-card").first().waitFor();
    } else {
      await page.getByRole("combobox", { name: "Sort shops" }).selectOption("fee_asc");
      await page.waitForURL("**sort=fee_asc**");
      await page.getByRole("combobox", { name: "Pickup or delivery" }).selectOption("pickup");
      await page.getByRole("checkbox", { name: "Open now" }).check();
      await page.getByRole("button", { name: "Clear filters" }).first().click();
    }
  }
  // Browser-only labelled fixture: no database records or merchant photos created.
  await page.route("**/areas", (route) =>
    route.fulfill({
      json: [{ id: "qa-area", name: "QA preview area", city: "QA", pincodes: [], active: true }],
    }),
  );
  await page.route("**/shops?**", (route) =>
    route.fulfill({
      headers: { "X-Total-Count": "1" },
      json: [
        {
          id: "qa-shop",
          slug: "qa-preview",
          name: "QA preview shop",
          tagline: "Browser-only layout fixture",
          description: "",
          locality: "QA market",
          categories: ["fast-food-snacks"],
          serviceAreaIds: ["qa-area"],
          isOpen: true,
          hours: "09:00–18:00",
          fulfilment: ["pickup"],
          initials: "QA",
        },
      ],
    }),
  );
  await page.addInitScript(() => localStorage.setItem("jpi.area", "qa-area"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "QA preview shop" }).waitFor();
  await page.locator(".category-shop-card").screenshot({ path: "docs/category-shop-card-qa.png" });
  console.log(
    "Search empty state, subcategory search, sorting, fulfilment, open filter, reset and shop-card fixture passed.",
  );
} finally {
  await browser.close();
}
