import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "D:/justpackit/.qa-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
try {
  const seller = await browser.newPage();
  await seller.goto("http://localhost:8083/__qa/bootstrap/seller", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await seller.waitForURL("**/seller/orders", { timeout: 45000 });
  await seller.goto("http://localhost:8083/seller/settings", { waitUntil: "domcontentloaded" });
  const panel = seller.getByRole("region", { name: "Shop availability" });
  await panel.getByRole("heading", { name: "Today’s shop controls" }).waitFor({ timeout: 30000 });
  await seller.waitForTimeout(1500);
  for (const width of [1440, 390, 320]) {
    await seller.setViewportSize({ width, height: 950 });
    if (await seller.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      console.log(
        await seller.evaluate(() =>
          [...document.querySelectorAll("input,select,textarea,section,form")]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .map((el) => ({
              tag: el.tagName,
              name: el.getAttribute("name"),
              cls: el.className,
              right: el.getBoundingClientRect().right,
            })),
        ),
      );
      await seller.screenshot({ path: "docs/availability-overflow-qa.png", fullPage: true });
      throw new Error(`Seller overflow ${width}`);
    }
    await panel.screenshot({ path: `docs/availability-${width}.png` });
  }
  const save = async () => {
    const response = seller.waitForResponse(
      (r) => r.url().endsWith("/seller/shop/availability") && r.request().method() === "PATCH",
    );
    await panel.getByRole("button", { name: "Save availability" }).click();
    const r = await response;
    if (r.status() !== 200) throw new Error(`Save ${r.status()}`);
    const data = await r.json();
    if (data.status !== "approved") throw new Error("Approval changed");
    return data;
  };
  await panel.getByRole("checkbox", { name: "Temporarily close for new orders" }).check();
  const closed = await save();
  const buyer = await browser.newPage();
  await buyer.goto(`http://localhost:8083/shop/${closed.slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await buyer.getByText("This shop is closed right now.", { exact: false }).waitFor();
  console.log("Pause saved, approval preserved, buyer closed-shop banner verified");
  await panel.getByRole("checkbox", { name: "Shop delivers", exact: true }).uncheck();
  const pickup = await save();
  const publicDto = await (
    await seller.request.get(`http://localhost:4001/shops/${pickup.slug}`)
  ).json();
  if (publicDto.fulfilment.join() !== "pickup") throw new Error("Buyer fulfilment mismatch");
  await panel.getByRole("checkbox", { name: "Temporarily close for new orders" }).uncheck();
  await save();
  await buyer
    .getByText("This shop is closed right now.", { exact: false })
    .waitFor({ state: "hidden", timeout: 40000 });
  console.log("Pickup-only public response and buyer automatic reopening refresh passed");
  await seller.screenshot({ path: "docs/availability-saved-qa.png", fullPage: true });
  console.log("Three responsive widths passed; all writes confined to isolated QA DEMO MongoDB.");
} finally {
  await browser.close();
}
