/** Explicit operator-selected catalogue configuration; no default location or sample shops. */
import "dotenv/config";
import { loadConfig } from "../src/config/env.js";
import {z} from "zod";

const definitions = [
  ["grocery-kirana", "Grocery & Kirana"],
  ["fruits-vegetables", "Fruits & Vegetables"],
  ["dairy-eggs", "Dairy, Bread & Eggs"],
  ["fast-food-snacks", "Fast Food & Snacks"],
  ["restaurants-meals", "Restaurants & Meals"],
  ["sweets-bakery", "Mithai, Sweets & Bakery"],
  ["fashion", "Clothing, Footwear & Fashion"],
  ["meat-seafood", "Chicken, Meat, Fish & Seafood"],
  ["electronics", "Electronics & Mobile Accessories"],
  ["personal-care-household", "Personal Care & Household"],
  ["stationery-books", "Stationery, Books & School"],
  ["toys-gifts-decor", "Toys, Gifts & Home Decor"],
  ["pooja-supplies", "Pooja Supplies"],
  ["hardware-electrical-plumbing", "Hardware, Electrical & Plumbing"],
  ["kitchen-home-goods", "Kitchenware & Home Goods"],
  ["flowers-plants", "Flowers & Plants"],
  ["pet-supplies", "Pet Supplies"],
];

async function main() {
  const config = loadConfig();
  if (config.NODE_ENV !== "development") throw new Error("Development only");
  const selected=z.object({name:z.string().trim().min(2).max(100),city:z.string().trim().min(2).max(100),pincodes:z.array(z.string().regex(/^\d{6}$/)).min(1)}).parse({name:process.env.SETUP_AREA_NAME,city:process.env.SETUP_AREA_CITY,pincodes:process.env.SETUP_AREA_PINCODES?.split(",").map(value=>value.trim())});
  const base = `http://127.0.0.1:${config.PORT}`;
  const auth: { token?: string } = {};
  async function request(path: string, body?: unknown) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`API ${response.status} ${result?.code ?? "ERROR"}`);
    return result;
  }
  const session = await request("/auth/login", {
    phone: process.env.OPERATOR_PHONE,
    password: process.env.OPERATOR_PASSWORD,
  });
  auth.token = session.token;
  try {
    if (session.role !== "admin") throw new Error("Admin required");
    const areas = await request("/admin/areas");
    const area = areas.find((item: { name: string;city:string; pincodes: string[] }) => item.name === selected.name && item.city===selected.city && selected.pincodes.every(pin=>item.pincodes.includes(pin)));
    if (!area) await request("/admin/areas", selected);
    const categories = await request("/admin/categories");
    let created = 0;
    for (const [slug, name] of definitions) {
      if (categories.some((item: { slug: string }) => item.slug === slug)) continue;
      await request("/admin/categories", { slug, name });
      created++;
    }
    const publicAreas = await request("/areas");
    const publicCategories = await request("/categories");
    if (!publicAreas.some((item: { name: string;city:string; pincodes: string[] }) => item.name === selected.name && item.city===selected.city && selected.pincodes.every(pin=>item.pincodes.includes(pin)))) throw new Error("Area not public");
    if (!definitions.every(([slug]) => publicCategories.some((item: { slug: string }) => item.slug === slug))) throw new Error("Taxonomy not public");
    console.info(JSON.stringify({ area: selected.name, pincodes:selected.pincodes, configuredCategories: definitions.length, createdCategories: created, publicVerification: "passed" }));
  } finally {
    await request("/auth/logout", {});
  }
}
main().catch(() => {
  console.error("Catalogue configuration failed. Check explicit SETUP_AREA_NAME, SETUP_AREA_CITY, SETUP_AREA_PINCODES, API availability and admin credentials. No credentials were logged.");
  process.exitCode = 1;
});
