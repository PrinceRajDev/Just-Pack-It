import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve("../.qa-browsers");
const { chromium } = await import("playwright-core");
const base = "http://localhost:8083",
  api = "http://localhost:4001",
  report = await fetch(api + "/__qa/report").then((r) => r.json());
assert.equal(report.isolated, true);
const orderId = report.orders[0].id;
const browser = await chromium.launch({ headless: true }),
  contexts = [],
  errors = [];
async function login(role) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(c);
  await c.route("**/*", (r) =>
    ["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname)
      ? r.continue()
      : r.abort(),
  );
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/__qa/bootstrap/" + role);
  await p.waitForURL((u) => !u.pathname.startsWith("/__qa"));
  return p;
}
async function adminApi(page, path, method = "GET", body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const s = JSON.parse(localStorage.getItem("jpi.session.api:http://localhost:4001"));
      const r = await fetch("http://localhost:4001" + path, {
        method,
        headers: { authorization: "Bearer " + s.token, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, data: await r.json().catch(() => null) };
    },
    { path, method, body },
  );
}
try {
  const buyer = await login("buyer");
  await buyer.goto(base + "/orders/" + orderId);
  await buyer.getByText("Help with this shop order", { exact: true }).click();
  await buyer
    .getByLabel("Describe the issue", { exact: true })
    .fill("QA DEMO missing package needs review");
  await buyer.getByRole("button", { name: "Report issue", exact: true }).click();
  await buyer.getByRole("region", { name: "Support conversation", exact: true }).waitFor();
  await buyer.getByLabel("Your reply", { exact: true }).fill("QA DEMO buyer additional details");
  await buyer.getByRole("button", { name: "Send reply", exact: true }).click();
  await buyer.getByText("QA DEMO buyer additional details", { exact: true }).waitFor();
  const admin = await login("admin");
  await admin.goto(base + "/admin/support");
  await admin.getByLabel("Search support tickets", { exact: true }).fill("missing package");
  await admin.getByRole("button", { name: "Search tickets", exact: true }).click();
  await admin.getByText("QA DEMO missing package needs review", { exact: true }).waitFor();
  await admin
    .getByLabel("Your reply", { exact: true })
    .fill("QA DEMO support conversation response");
  await admin.getByRole("button", { name: "Send reply", exact: true }).click();
  await admin.getByText("QA DEMO support conversation response", { exact: true }).waitFor();
  await admin
    .getByLabel("Buyer-visible update / resolution", { exact: true })
    .fill("QA DEMO resolution requires no payment change");
  await admin.getByRole("button", { name: "Resolve ticket", exact: true }).click();
  await admin.getByRole("button", { name: "Reopen ticket", exact: true }).waitFor();
  await buyer.getByRole("button", { name: "Refresh status", exact: true }).click();
  await buyer
    .getByLabel("Reason to reopen (at least 10 characters)", { exact: true })
    .fill("QA DEMO problem still needs a review");
  await buyer.getByRole("button", { name: "Reopen ticket", exact: true }).click();
  await buyer.getByLabel("Your reply", { exact: true }).waitFor();
  await buyer.getByText("QA DEMO resolution requires no payment change", { exact: true }).waitFor();
  await admin.goto(base + "/admin/catalog");
  await admin
    .getByLabel("Reason for seller", { exact: true })
    .first()
    .fill("QA DEMO review of listing");
  const card = admin
    .locator("form")
    .filter({ has: admin.getByRole("button", { name: "Block listing", exact: true }) })
    .first();
  const id = (await card.innerText()).match(/Listing ([0-9a-f-]{36})/)[1];
  await card.getByRole("button", { name: "Block listing", exact: true }).click();
  await admin.getByRole("button", { name: "Remove admin block", exact: true }).waitFor();
  assert.equal((await fetch(api + "/products/" + id)).status, 404);
  const blockedCard = admin
    .locator("form")
    .filter({ has: admin.getByRole("button", { name: "Remove admin block", exact: true }) });
  await blockedCard
    .getByLabel("Reason for seller", { exact: true })
    .fill("QA DEMO reviewed and restored");
  await blockedCard.getByRole("button", { name: "Remove admin block", exact: true }).click();
  await admin.getByRole("button", { name: "Block listing", exact: true }).first().waitFor();
  const category = await adminApi(admin, "/admin/categories", "POST", {
    name: "QA DEMO UNUSED TAXONOMY",
    slug: "qa-unused-" + Date.now(),
    blurb: "QA DEMO",
  });
  assert.equal(category.status, 201);
  assert.equal(
    (
      await adminApi(admin, "/admin/categories/" + category.data.id, "DELETE", {
        version: category.data.version,
      })
    ).status,
    204,
  );
  await admin.reload();
  await admin.getByRole("button", { name: "Reactivate category", exact: true }).click();
  await admin.waitForFunction(() =>
    [...document.querySelectorAll("input")].some(
      (i) => i.value === "QA DEMO UNUSED TAXONOMY" && !i.disabled,
    ),
  );
  const saved = await adminApi(admin, "/admin/categories");
  assert.equal(saved.data.find((c) => c.id === category.data.id).active, true);
  await admin.goto(base + "/admin/settings");
  await admin.getByLabel("Exact action", { exact: true }).fill("product.block");
  await admin.getByRole("button", { name: "Filter audit", exact: true }).click();
  await admin.getByText("product.block", { exact: true }).waitFor();
  await admin.goto(base + "/admin/finance");
  await admin.getByRole("heading", { name: "Settlement reconciliation", exact: true }).waitFor();
  assert.equal(await admin.getByRole("button", { name: /Transfer|Pay seller/ }).count(), 0);
  assert.equal(
    await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.equal(
    await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  await mkdir("docs/admin-support-verification", { recursive: true });
  await admin.screenshot({
    path: "docs/admin-support-verification/mobile-reconciliation.png",
    fullPage: true,
  });
  await buyer.screenshot({
    path: "docs/admin-support-verification/mobile-conversation.png",
    fullPage: true,
  });
  await writeFile(
    "docs/admin-support-verification/browser-report.json",
    JSON.stringify(
      {
        isolated: true,
        checks: [
          "buyer creates owned ticket",
          "buyer reply persists",
          "admin literal ticket search",
          "admin conversation reply",
          "admin resolves",
          "buyer reopens with explanation",
          "resolution history retained",
          "admin blocks public listing",
          "admin removes block",
          "taxonomy reactivates same ID",
          "audit action filter",
          "read-only reconciliation no transfer buttons",
          "390px no overflow for admin/buyer",
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log("14 isolated admin/support browser checks passed.");
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
