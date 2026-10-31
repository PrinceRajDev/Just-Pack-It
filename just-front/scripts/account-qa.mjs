const newName = `QA DEMO renamed buyer ${Date.now()}`;
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const fixture = await fetch("http://127.0.0.1:4001/__qa/checkout").then((r) => r.json());
assert.equal(fixture.isolated, true);
const browser = await chromium.launch({ headless: true }),
  checks = [],
  errors = [];
let p;
await mkdir("docs/account-qa", { recursive: true });
async function key(page) {
  return page.evaluate(
    () =>
      `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:user:${JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001")).userId}`,
  );
}
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:8083/account");
  const product = fixture.products[0],
    variant = product.variants[0];
  await p.evaluate(
    ({ product, variant }) => {
      const base = `jpi.shopping:${encodeURIComponent("http://localhost:4001")}:guest`;
      localStorage.setItem(
        base + ":cart",
        JSON.stringify({
          [`${product.id}::${variant.id}`]: {
            productId: product.id,
            variantId: variant.id,
            qty: 1,
            acceptedPrice: 25,
          },
        }),
      );
      localStorage.setItem(base + ":wish", JSON.stringify([product.id]));
    },
    { product, variant },
  );
  await p.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.getByRole("button", { name: "Import guest items", exact: true }).waitFor();
  const a = await key(p);
  assert.equal(await p.evaluate((base) => localStorage.getItem(base + ":cart"), a), "{}");
  await p.getByRole("button", { name: "Import guest items", exact: true }).click();
  await p.waitForFunction(
    (base) => Object.keys(JSON.parse(localStorage.getItem(base + ":cart") ?? "{}")).length === 1,
    a,
  );
  checks.push("Guest cart/wishlist remain separate until explicit import");
  await p.goto("http://localhost:8083/account");
  await p.getByLabel("Your name", { exact: true }).fill(newName);
  await p.getByRole("button", { name: "Save profile", exact: true }).click();
  await p.getByText(`Saved name: ${newName}`, { exact: true }).waitFor();
  await p.reload();
  await p.getByText(`Saved name: ${newName}`, { exact: true }).waitFor();
  assert.equal(await key(p), a);
  checks.push(
    "Display name saves through own-profile API and survives reload without changing identity",
  );
  await p.goto("http://localhost:8083/account?tab=wishlist");
  await p.getByRole("heading", { name: "Your wishlist", exact: true }).waitFor();
  await p.getByRole("link", { name: "QA DEMO Rice", exact: true }).first().waitFor();
  checks.push("Imported wishlist renders for buyer A");
  await p.goto("http://localhost:8083/__qa/bootstrap/other-buyer");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/account?tab=wishlist");
  await p.getByText(/No saved products yet/).waitFor();
  const b = await key(p);
  assert.notEqual(a, b);
  assert.equal(
    await p.evaluate(
      (base) => Object.keys(JSON.parse(localStorage.getItem(base + ":cart") ?? "{}")).length,
      b,
    ),
    0,
  );
  assert.equal(
    await p.evaluate(
      (base) => Object.keys(JSON.parse(localStorage.getItem(base + ":cart") ?? "{}")).length,
      a,
    ),
    1,
  );
  checks.push("Buyer B has isolated empty cart/wishlist; buyer A data preserved");
  await p.goto("http://localhost:8083/__qa/bootstrap/buyer");
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  await p.goto("http://localhost:8083/account?tab=wishlist");
  await p.getByRole("link", { name: "QA DEMO Rice", exact: true }).first().waitFor();
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: "docs/account-qa/wishlist-mobile.png", fullPage: true });
  await p.goto("http://localhost:8083/account");
  await p.getByRole("button", { name: "Sign out", exact: true }).click();
  await p.getByRole("link", { name: "Sign in", exact: true }).last().waitFor();
  await p.goto("http://localhost:8083/account?tab=wishlist");
  await p.getByText(/No saved products yet/).waitFor();
  checks.push(
    "Buyer A data restored on return; sign-out shows guest data without leaking account wishlist",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/account-qa/report.json",
    JSON.stringify({ verified: true, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ verified: true, checks }));
} catch (e) {
  console.error(String(e));
  if (p) {
    console.log((await p.locator("body").innerText()).slice(-4000));
    await p.screenshot({ path: "docs/account-qa/failure.png", fullPage: true });
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
