import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  const page = await browser.newPage();
  const externalFonts = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url());
  });
  for (const [name, path] of [
    ["home", "/"],
    ["categories", "/categories"],
    ["food", "/category/fast-food-snacks"],
    ["login", "/login"],
    ["cart", "/cart"],
    ["admin-access", "/admin/users"],
    ["seller-access", "/seller"],
    ["delivery-access", "/delivery"],
  ]) {
    await page.goto(`http://localhost:8081${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      await document.fonts.load("400 16px Manrope");
      await document.fonts.load('600 32px "Plus Jakarta Sans"');
      await document.fonts.ready;
    });
    const fonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      loaded:
        document.fonts.check("400 16px Manrope") &&
        document.fonts.check('600 32px "Plus Jakarta Sans"'),
    }));
    if (!fonts.body.includes("Manrope") || !fonts.loaded) throw new Error(`Fonts failed: ${name}`);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
        throw new Error(`Overflow ${name} ${width}`);
      if (["home", "categories", "login"].includes(name) && width !== 320)
        await page.screenshot({ path: `docs/type-${name}-${width}.png`, fullPage: true });
    }
    console.log(name, "local fonts loaded; 1440/390/320 fit");
  }
  if (externalFonts.length) throw new Error("Runtime external font requests detected");
  console.log(
    "24 responsive checks passed. No runtime Google font requests. Protected workspaces checked signed out.",
  );
} finally {
  await browser.close();
}
