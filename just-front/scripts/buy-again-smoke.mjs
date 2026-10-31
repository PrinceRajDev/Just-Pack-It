import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const api = "http://localhost:4001",
  base = "http://localhost:8083";
assert.equal((await fetch(api + "/__qa/report").then((r) => r.json())).isolated, true);
const [area] = await fetch(api + "/areas").then((r) => r.json());
const products = await fetch(api + `/products?area=${area.id}`).then((r) => r.json());
const product = products.find((p) => p.variants?.length),
  variant = product.variants[0];
const shops = await fetch(api + `/shops?area=${area.id}`).then((r) => r.json());
const shop = shops.find((s) => s.id === product.shopId);
const order = {
  id: "qa-reorder",
  testMode: true,
  createdAt: "2026-10-31T10:00:00Z",
  addressId: "qa",
  paymentMethod: "cod",
  paymentStatus: "unpaid",
  total: 5,
  subOrders: [
    {
      id: "qa-part",
      shopId: shop.id,
      shopName: shop.name,
      shopAddress: "QA DEMO recorded seller address",
      status: "delivered",
      fulfilment: "pickup",
      deliveryFee: 0,
      lines: [
        {
          productId: product.id,
          variantId: variant.id,
          variantLabel: variant.label,
          name: product.name,
          unit: product.unit,
          qty: 1,
          price: 5,
        },
      ],
    },
  ],
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [];
await context.route("**/*", (r) => {
  const u = new URL(r.request().url());
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) return r.abort();
  if (u.port === "4001" && u.pathname === "/orders/qa-reorder")
    return r.fulfill({ headers: { "access-control-allow-origin": "*" }, json: order });
  return r.continue();
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/__qa/bootstrap/buyer");
  await page.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await page.evaluate((id) => localStorage.setItem("jpi.area", id), area.id);
  await page.goto(base + "/orders/qa-reorder");
  await page.getByRole("button", { name: "Check items to buy again", exact: true }).click();
  await page.getByRole("button", { name: "Add available items to bag", exact: true }).waitFor();
  assert.match(
    await page.getByRole("region", { name: "Buy again", exact: true }).innerText(),
    /previously/,
  );
  await page.getByRole("button", { name: "Add available items to bag", exact: true }).click();
  await page
    .getByText("1 available item lines added. Review your bag before checkout.", { exact: true })
    .waitFor();
  const cart = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
    return JSON.parse(
      localStorage.getItem(
        `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${s.userId}:cart`,
      ),
    );
  });
  assert.deepEqual(
    Object.values(cart).map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      qty: l.qty,
      acceptedPrice: l.acceptedPrice,
    })),
    [{ productId: product.id, variantId: variant.id, qty: 1, acceptedPrice: variant.price }],
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  await page.emulateMedia({ media: "print" });
  const receipt = page.locator(".order-receipt");
  assert.equal(await receipt.isVisible(), true);
  assert.match(await receipt.innerText(), /QA DEMO recorded seller address/);
  assert.match(await receipt.innerText(), /TEST ORDER/);
  assert.match(await receipt.innerText(), /Unpaid/);
  assert.equal(
    await page.getByRole("region", { name: "Buy again", exact: true }).isVisible(),
    false,
  );
  assert.equal(await receipt.locator("table").isVisible(), true);
  assert.deepEqual(errors, []);
  await mkdir("docs/buy-again", { recursive: true });
  await page.screenshot({ path: "docs/buy-again/receipt-print.png", fullPage: true });
  await writeFile(
    "docs/buy-again/browser-report.json",
    JSON.stringify(
      {
        isolated: true,
        mockedOwnedOrderSnapshot: true,
        realCartQuote: true,
        checks: [
          "exact variant added at fresh price",
          "old price change displayed",
          "cart scoped to buyer",
          "390px no overflow",
          "print-only receipt visible",
          "seller snapshot retained",
          "test and unpaid labels",
          "other UI excluded from print",
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "9 buyer reorder/receipt browser checks passed (isolated quote API, simulated historical order).",
  );
} finally {
  await browser.close();
}
