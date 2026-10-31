import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  output = resolve("docs/frontend-audit");
assert.equal(
  (await fetch("http://127.0.0.1:4001/__qa/report").then((r) => r.json())).isolated,
  true,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  results = [],
  errors = [];
let stage = "startup";
try {
  for (const role of ["guest", "buyer", "seller", "admin"]) {
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return ["localhost", "127.0.0.1"].includes(u.hostname) && ["8083", "4001"].includes(u.port)
        ? route.continue()
        : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push({ stage, message: e.message }));
    if (role !== "guest") {
      await page.goto(`${base}/__qa/bootstrap/${role}`);
      await page.waitForURL((url) => !url.pathname.startsWith("/__qa"));
    }
    const routes =
      role === "guest"
        ? ["/login", "/categories", "/cart", "/seller", "/admin", "/delivery", "/missing-page"]
        : role === "buyer"
          ? [
              "/account",
              "/search",
              "/category/qa-demo-grocery",
              "/shop/qa-demo-counter-1",
              "/orders",
              "/seller",
              "/admin",
            ]
          : role === "seller"
            ? [
                "/seller",
                "/seller/settings",
                "/seller/products",
                "/seller/products/new",
                "/seller/inventory",
                "/seller/orders",
              ]
            : ["/admin", "/admin/partners", "/admin/catalog", "/admin/orders", "/admin/finance"];
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of routes) {
        stage = `${role} ${path} ${width}`;
        await page.goto(base + path);
        await page.waitForLoadState("networkidle");
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        assert.equal(
          await page.getByText("This page didn't load", { exact: true }).count(),
          0,
          stage,
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `Overflow: ${stage}`,
        );
        if (path === "/login") {
          await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
          await page.getByLabel("Password", { exact: true }).fill("Audit-password-2026");
          await page.getByRole("button", { name: "Show password", exact: true }).click();
          await page.getByRole("button", { name: "Hide password", exact: true }).waitFor();
          assert.equal(
            await page.getByLabel("Password", { exact: true }).getAttribute("type"),
            "text",
          );
          await page.getByRole("button", { name: "Hide password", exact: true }).click();
          await page.getByRole("button", { name: "Show password", exact: true }).waitFor();
          assert.equal(
            await page
              .getByRole("button", { name: "Sign in", exact: true })
              .evaluate((el) => getComputedStyle(el).cursor),
            "pointer",
          );
          await page.screenshot({ path: resolve(output, `login-${width}.png`), fullPage: true });
          await page.getByRole("button", { name: "New here? Create an account" }).click();
          await page.getByRole("radio", { name: /Seller/ }).check();
          await page.getByLabel("Shop name", { exact: true }).waitFor();
          await page.getByLabel("Shop photo (optional)").waitFor();
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `Signup overflow ${width}`,
          );
          await page.screenshot({ path: resolve(output, `signup-${width}.png`), fullPage: true });
        }
        results.push({ role, path, width, passed: true });
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ verified: true, checks: results.length, results, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      verified: true,
      checks: results.length,
      report: "docs/frontend-audit/report.json",
    }),
  );
} catch (error) {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ verified: false, stage, error: String(error), results, errors }, null, 2),
  );
  console.error(stage, String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
