import { describe, expect, it } from "vitest";
import { catalog, shopsQuery, productsQuery } from "@/services/catalog";

describe("area-scoped demo catalogue", () => {
  it("only exposes shops explicitly assigned to the requested area", async () => {
    const areas = await catalog.areas();
    const active = areas.find((area) => area.active)!;
    const shops = await catalog.shops(active.id);
    expect(shops.length).toBeGreaterThan(0);
    expect(shops.every((shop) => shop.serviceAreaIds?.includes(active.id))).toBe(true);
    expect(await catalog.shops("unserved-area")).toEqual([]);
    expect(await catalog.shops("z2")).toEqual([]);
  });

  it("filters products by their actual owning shop and keeps area caches separate", async () => {
    expect(await catalog.products({ area: "unserved-area" })).toEqual([]);
    const shops = await catalog.shops("z1");
    const products = await catalog.products({ area: "z1", category: "grocery-kirana" });
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => shops.some((s) => s.id === p.shopId))).toBe(true);
    expect(products.every((p) => p.categorySlug === "grocery-kirana")).toBe(true);
    expect(shopsQuery("z1").queryKey).not.toEqual(shopsQuery("z2").queryKey);
    expect(productsQuery({ area: "z1" }).queryKey).not.toEqual(
      productsQuery({ area: "z2" }).queryKey,
    );
  });
});
