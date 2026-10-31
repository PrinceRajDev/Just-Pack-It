import type { CartLine, Product, Shop } from "@/domain/types";
import { inr } from "@/lib/image";

export interface BagIssue {
  shopId?: string;
  message: string;
}
export function bagReadiness(
  lines: CartLine[],
  productLookup: (id: string) => Product | undefined,
  shopLookup: (id: string) => Shop | undefined,
): BagIssue[] {
  const issues: BagIssue[] = [];
  const totals = new Map<string, number>();
  const shops = new Map<string, Shop>();
  for (const line of lines) {
    const product = productLookup(line.productId);
    if (!product) {
      issues.push({ message: "An item is no longer available. Remove it from your bag." });
      continue;
    }
    const shop = shopLookup(product.shopId);
    if (!shop) {
      issues.push({ message: `${product.name}: shop is no longer available.` });
      continue;
    }
    shops.set(shop.id, shop);
    const variant = product.variants?.find((v) => v.id === line.variantId);
    const issue = (message: string) =>
      issues.push({
        shopId: shop.id,
        message: `${shop.name} · ${product.name}${variant ? ` (${variant.label})` : ""}: ${message}`,
      });
    if ((product.variants?.length && !variant) || (line.variantId && !variant)) {
      issue("choose an available option again.");
      continue;
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      issue("quantity is invalid.");
      continue;
    }
    const stock = variant?.stock ?? product.stock;
    const price = variant?.price ?? product.price;
    if (line.acceptedPrice !== undefined && line.acceptedPrice !== price)
      issue(
        `price changed from ${inr(line.acceptedPrice)} to ${inr(price)}. Review and accept the current price in your bag.`,
      );
    if (stock <= 0) issue("out of stock. Remove this item.");
    else if (line.qty > stock) issue(`only ${stock} available; reduce quantity from ${line.qty}.`);
    totals.set(shop.id, (totals.get(shop.id) ?? 0) + line.qty * (variant?.price ?? product.price));
  }
  for (const shop of shops.values()) {
    if (!shop.isOpen)
      issues.push({
        shopId: shop.id,
        message: `${shop.name} is closed. Remove its items or return when it reopens. Hours: ${shop.hours}.`,
      });
    if (
      shop.minimumOrderAmount !== undefined &&
      Number.isFinite(shop.minimumOrderAmount) &&
      shop.minimumOrderAmount > (totals.get(shop.id) ?? 0)
    )
      issues.push({
        shopId: shop.id,
        message: `${shop.name}: add ${inr(shop.minimumOrderAmount - (totals.get(shop.id) ?? 0))} more to meet the ${inr(shop.minimumOrderAmount)} item minimum (delivery excluded).`,
      });
  }
  return issues;
}
