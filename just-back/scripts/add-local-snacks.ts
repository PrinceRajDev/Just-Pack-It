/** Operator-requested taxonomy only; never seeds shops or products. */
import "dotenv/config";
import { loadConfig } from "../src/config/env.js";

async function main() {
  const config = loadConfig();
  if (config.NODE_ENV !== "development") throw new Error("Development only");
  const base = `http://127.0.0.1:${config.PORT}`;
  const auth: { token?: string } = {};
  async function request(path: string, body?: unknown) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }
  const session = await request("/auth/login", { phone: process.env.OPERATOR_PHONE, password: process.env.OPERATOR_PASSWORD });
  auth.token = session.token;
  try {
    if (session.role !== "admin") throw new Error("Admin required");
    const categories = await request("/admin/categories");
    let category = categories.find((item: { slug: string }) => item.slug === "fast-food-snacks");
    if (!category || category.active === false) throw new Error("Active food category required");
    let created = 0;
    for (const [slug, name] of [["samosa", "Samosa"], ["litti", "Litti"]]) {
      const existing = category.subcategories.find((sub: { slug: string }) => sub.slug === slug);
      if (existing?.active === false) throw new Error("Existing inactive subcategory requires admin review");
      if (existing) continue;
      category = await request(`/admin/categories/${encodeURIComponent(category.id)}/subcategories`, { slug, name, version: category.version });
      created++;
    }
    const publicCategories = await request("/categories");
    const food = publicCategories.find((item: { slug: string }) => item.slug === "fast-food-snacks");
    if (!["samosa", "litti"].every(slug => food?.subcategories.some((sub: { slug: string }) => sub.slug === slug))) throw new Error("Public verification failed");
    console.info(JSON.stringify({ category: "fast-food-snacks", subcategories: ["samosa", "litti"], created, publicVerification: "passed" }));
  } finally {
    await request("/auth/logout", {});
  }
}
main().catch(() => { console.error("Snack taxonomy update failed. Check local API, active taxonomy and operator account. No credentials logged."); process.exitCode = 1; });

