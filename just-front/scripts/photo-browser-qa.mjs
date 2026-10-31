import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const sharp = createRequire(resolve("../just-back/package.json"))("sharp");
const api = "http://127.0.0.1:4001",
  base = "http://localhost:8083",
  output = resolve("docs/browser-qa");
const storage = await fetch(`${api}/__qa/storage`).then((r) => r.json());
assert.equal(storage.isolated, true);
assert.equal(storage.liveR2, true);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [];
let page,
  report = { isolated: true, liveR2: true, verified: false };
try {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      (["localhost", "127.0.0.1"].includes(url.hostname) && ["8083", "4001"].includes(url.port)) ||
      url.origin === new URL(storage.publicBase).origin
    )
      return route.continue();
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/__qa/bootstrap/seller`);
  await page.waitForURL(/\/seller\/orders/);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.goto(`${base}/seller/products`);
  await page.getByRole("link", { name: "Edit listing and stock", exact: true }).click();
  const input = page.getByLabel("Choose product photo", { exact: true });
  await input.waitFor();
  async function upload(color) {
    const buffer = await sharp({
      create: { width: 120, height: 80, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    await input.setInputFiles({ name: "qa-demo-photo.png", mimeType: "image/png", buffer });
    await page.getByAltText("Selected product photo preview", { exact: true }).waitFor();
    const responsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/seller\/products\/[^/]+\/image$/.test(new URL(r.url()).pathname),
    );
    await page.getByRole("button", { name: "Upload and save photo", exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const product = await response.json();
    await page.waitForFunction((url) => {
      const img = document.querySelector('img[alt="Current saved product photo"]');
      return img?.src === url && img.complete && img.naturalWidth > 0;
    }, product.image);
    assert.equal(
      await page.getByAltText("Selected product photo preview", { exact: true }).count(),
      0,
    );
    const remote = await fetch(product.image);
    assert.equal(remote.status, 200);
    assert.match(remote.headers.get("content-type"), /image\/webp/);
    const metadata = await sharp(Buffer.from(await remote.arrayBuffer())).metadata();
    assert.equal(metadata.width, 120);
    assert.equal(metadata.height, 80);
    return product;
  }
  const first = await upload("#154b31");
  await page.reload();
  await page.waitForFunction((url) => {
    const img = document.querySelector('img[alt="Current saved product photo"]');
    return img?.src === url && img.complete && img.naturalWidth > 0;
  }, first.image);
  const second = await upload("#c5e946");
  assert.notEqual(second.image, first.image);
  assert.ok(second.version > first.version);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(output, "seller-r2-photo-upload.png"), fullPage: true });
  assert.deepEqual(errors, []);
  report = {
    ...report,
    verified: true,
    browser: browser.version(),
    preview: true,
    upload: true,
    publicImageLoaded: true,
    persistedAfterReload: true,
    replacement: true,
    versionAdvanced: true,
    mobileWidth: true,
    runtimeErrors: errors,
  };
} catch (error) {
  report.error = String(error);
  if (page)
    await page
      .screenshot({ path: resolve(output, "seller-r2-photo-failed.png"), fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  const cleanup = await fetch(`${api}/__qa/cleanup-photos`, { method: "POST" }).then((r) =>
    r.json(),
  );
  report.cleanup = cleanup;
  await context.close();
  await browser.close();
  await writeFile(resolve(output, "photo-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.verified || cleanup.remaining !== 0) process.exitCode = 1;
}
