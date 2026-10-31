import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
assert.equal(
  (await fetch("http://localhost:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
const [area] = await fetch("http://localhost:4001/areas").then((r) => r.json());
const [product] = await fetch(`http://localhost:4001/products?area=${area.id}`).then((r) =>
  r.json(),
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const requests = [],
  errors = [];
let failNext = true;
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
  if (url.port === "4001" && ["/products", "/shops"].includes(url.pathname))
    requests.push(url.href);
  if (url.port === "4001" && url.pathname === "/products") {
    const next = url.searchParams.has("cursor");
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "X-Next-Cursor,X-Has-More,X-Total-Count",
      "X-Total-Count": "26",
      "X-Has-More": next ? "false" : "true",
      ...(!next ? { "X-Next-Cursor": "qa-page-2" } : {}),
    };
    if (next && failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        headers,
        json: { error: { code: "QA_FAILURE", message: "Isolated QA failure" } },
      });
    }
    return route.fulfill({
      headers,
      json: Array.from({ length: next ? 2 : 24 }, (_, i) => ({
        ...product,
        id: `qa-page-product-${(next ? 24 : 0) + i}`,
        name: `QA DEMO product ${(next ? 24 : 0) + i}`,
      })),
    });
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://localhost:8083/");
  await page.waitForLoadState("networkidle");
  assert.equal(requests.length, 0, "no broad catalogue before area");
  await page.evaluate((id) => localStorage.setItem("jpi.area", id), area.id);
  await page.goto("http://localhost:8083/search");
  await page.getByRole("button", { name: "Load more products", exact: true }).waitFor();
  assert.equal(await page.locator(".catalogue-product-grid article").count(), 24);
  assert.ok(requests.every((url) => new URL(url).searchParams.get("area") === area.id));
  assert.equal(requests.filter((url) => new URL(url).searchParams.has("cursor")).length, 0);
  await page.getByRole("button", { name: "Load more products", exact: true }).click();
  await page.getByRole("button", { name: "Retry more products", exact: true }).waitFor();
  assert.equal(await page.locator(".catalogue-product-grid article").count(), 24);
  await page.getByRole("button", { name: "Retry more products", exact: true }).click();
  await page.getByText("26 loaded of 26 items", { exact: false }).waitFor();
  assert.equal(await page.locator(".catalogue-product-grid article").count(), 26);
  assert.equal(
    await page.getByRole("button", { name: "Load more products", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  await mkdir("docs/catalogue-pagination", { recursive: true });
  await writeFile(
    "docs/catalogue-pagination/browser-report.json",
    JSON.stringify(
      {
        isolated: true,
        mockedPagination: true,
        checks: [
          "No area: no catalogue list requests",
          "Area-scoped first page only",
          "24 cards before Load more",
          "Failed next page preserves cards",
          "Retry appends two unique cards",
          "No next button after final page",
          "390px no overflow",
          "No page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "8 catalogue browser assertions passed (isolated API + mocked pagination responses).",
  );
} finally {
  await browser.close();
}
