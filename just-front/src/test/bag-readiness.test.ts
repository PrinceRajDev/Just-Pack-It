import { describe, expect, it } from "vitest";
import { bagReadiness } from "@/lib/bag-readiness";
import type { Product, Shop } from "@/domain/types";

const shop: Shop = {
  id: "s",
  slug: "s",
  name: "Test shop",
  tagline: "",
  locality: "",
  categories: [],
  isOpen: true,
  hours: "9 to 5",
  fulfilment: ["pickup"],
  since: 2000,
  initials: "T",
};
const product: Product = {
  id: "p",
  name: "Item",
  unit: "piece",
  price: 40,
  stock: 2,
  shopId: "s",
  categorySlug: "test",
  description: "",
};
const check = (p = product, s = shop, qty = 1, variantId?: string) =>
  bagReadiness(
    [{ productId: p.id, qty, variantId }],
    () => p,
    () => s,
  );
describe("checkout readiness", () => {
  it("blocks closed shops, unavailable items and excessive/invalid quantities", () => {
    expect(check(product, { ...shop, isOpen: false })[0].message).toContain("closed");
    expect(check({ ...product, stock: 0 })[0].message).toContain("out of stock");
    expect(check(product, shop, 3)[0].message).toContain("only 2 available");
    expect(check(product, shop, 1.5)[0].message).toContain("invalid");
  });
  it("uses variant stock and rejects deleted or missing variants", () => {
    const p = { ...product, variants: [{ id: "v", label: "Small", price: 20, stock: 1 }] };
    expect(check(p, shop, 2, "v")[0].message).toContain("only 1 available");
    expect(check(p, shop, 1, "deleted")[0].message).toContain("choose an available option");
    expect(check(p)[0].message).toContain("choose an available option");
  });
  it("checks each shop item minimum without adding delivery or assuming a missing rule", () => {
    expect(check()).toEqual([]);
    expect(check(product, { ...shop, minimumOrderAmount: 0 })).toEqual([]);
    expect(check(product, { ...shop, minimumOrderAmount: 40 })).toEqual([]);
    expect(check(product, { ...shop, minimumOrderAmount: 100 })[0].message).toContain("₹60");
    const issues = bagReadiness(
      [
        { productId: "p", qty: 1 },
        { productId: "other", qty: 1 },
      ],
      (id) => (id === "p" ? product : { ...product, id, shopId: "other", price: 500 }),
      (id) => (id === "s" ? { ...shop, minimumOrderAmount: 100 } : { ...shop, id }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].shopId).toBe("s");
  });
  it("does not silently discard deleted products or shops", () => {
    expect(
      bagReadiness(
        [{ productId: "deleted", qty: 1 }],
        () => undefined,
        () => shop,
      ),
    ).toHaveLength(1);
    expect(
      bagReadiness(
        [{ productId: "p", qty: 1 }],
        () => product,
        () => undefined,
      ),
    ).toHaveLength(1);
  });
});
