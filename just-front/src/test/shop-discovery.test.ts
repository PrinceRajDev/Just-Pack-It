import { describe, expect, it } from "vitest";
import type { Shop } from "@/domain/types";
import { discoverShops, listedDeliveryFee, shopSearchSchema } from "@/lib/shop-discovery";

const shop = (id: string, extra: Partial<Shop> = {}): Shop => ({
  id,
  slug: id,
  name: id,
  tagline: "Daily provisions",
  locality: "Market Road",
  categories: ["grocery"],
  isOpen: true,
  hours: "9 to 5",
  fulfilment: ["platform_delivery"],
  since: 2000,
  initials: id,
  ...extra,
});

describe("shop discovery", () => {
  it("combines category, search, open and fulfilment filters without changing source data", () => {
    const shops = [
      shop("A", { fulfilment: ["pickup"] }),
      shop("B", { isOpen: false }),
      shop("C"),
      shop("D", { categories: ["fashion"] }),
    ];
    expect(
      discoverShops(shops, "grocery", {
        q: " MARKET ",
        openOnly: true,
        fulfilment: "delivery",
      }).map((s) => s.id),
    ).toEqual(["C"]);
    expect(discoverShops(shops, "grocery", { fulfilment: "pickup" }).map((s) => s.id)).toEqual([
      "A",
    ]);
    expect(discoverShops(shops, "grocery", { fulfilment: "seller_delivery" })).toEqual([]);
    expect(shops.map((s) => s.id)).toEqual(["A", "B", "C", "D"]);
  });

  it("sorts known fees including zero, with unknown/invalid/pickup-only fees always last", () => {
    const shops = [
      shop("Unknown"),
      shop("Free", { deliveryFee: 0 }),
      shop("Paid", { deliveryFee: 25 }),
      shop("Pickup", { fulfilment: ["pickup"], deliveryFee: 1 }),
    ];
    expect(discoverShops(shops, "grocery", { sort: "fee_asc" }).map((s) => s.id)).toEqual([
      "Free",
      "Paid",
      "Pickup",
      "Unknown",
    ]);
    expect(discoverShops(shops, "grocery", { sort: "fee_desc" }).map((s) => s.id)).toEqual([
      "Paid",
      "Free",
      "Pickup",
      "Unknown",
    ]);
    expect(listedDeliveryFee(shop("Bad", { deliveryFee: -1 }))).toBeUndefined();
    expect(listedDeliveryFee(shop("Bad", { deliveryFee: NaN }))).toBeUndefined();
  });

  it("supports legacy open links and parses false URL filters correctly", () => {
    expect(shopSearchSchema.parse({ openOnly: "false" }).openOnly).toBe(false);
    expect(shopSearchSchema.parse({ openOnly: "true" }).openOnly).toBe(true);
    expect(discoverShops([shop("Closed", { isOpen: false })], "grocery", { sort: "open" })).toEqual(
      [],
    );
    expect(shopSearchSchema.safeParse({ fulfilment: "invalid" }).success).toBe(false);
  });
});
