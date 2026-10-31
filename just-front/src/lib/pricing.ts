// Client-side price ESTIMATE for display. The server recalculates and is authoritative.
import { productById, shopById } from "@/services/catalog";
import type { CartLine, FulfilmentMethod, SubOrder } from "@/domain/types";

export const DELIVERY_FEE: Record<FulfilmentMethod, number> = {
  platform_delivery: 25,
  seller_delivery: 0,
  pickup: 0,
};
export const FREE_PLATFORM_DELIVERY_ABOVE = 299;

export function deliveryFeeFor(method: FulfilmentMethod, itemsTotal: number) {
  if (method === "platform_delivery" && itemsTotal >= FREE_PLATFORM_DELIVERY_ABOVE) return 0;
  return DELIVERY_FEE[method];
}

export function buildSubOrders(items: CartLine[]): SubOrder[] {
  const byShop = new Map<string, CartLine[]>();
  for (const it of items) {
    const p = productById(it.productId);
    if (!p) continue;
    byShop.set(p.shopId, [...(byShop.get(p.shopId) ?? []), it]);
  }
  return [...byShop.entries()].map(([shopId, its], i) => {
    const shop = shopById(shopId)!;
    const fulfilment = shop.fulfilment.find((f) => f !== "pickup") ?? "pickup";
    const lines = its.map((it) => {
      const p = productById(it.productId)!;
      const variant = it.variantId
        ? p.variants?.find((item) => item.id === it.variantId)
        : undefined;
      return {
        productId: p.id,
        variantId: it.variantId,
        variantLabel: variant?.label,
        name: p.name,
        unit: variant?.label ?? p.unit,
        qty: it.qty,
        price: variant?.price ?? p.price,
      };
    });
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    return {
      id: `S${i + 1}`,
      shopId,
      status: "placed",
      fulfilment,
      lines,
      deliveryFee: deliveryFeeFor(fulfilment, total),
    };
  });
}
