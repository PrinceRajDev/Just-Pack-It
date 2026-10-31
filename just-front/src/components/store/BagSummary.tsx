import { useMemo } from "react";
import { productById, shopById } from "@/services/catalog";
import { deliveryFeeFor, FREE_PLATFORM_DELIVERY_ABOVE } from "@/lib/pricing";
import type { CartLine, FulfilmentMethod, Product, Shop } from "@/domain/types";
import { useCart } from "@/stores/cart";
import { inr } from "@/lib/image";
import { bagReadiness } from "@/lib/bag-readiness";

export interface ShopGroup {
  shop: Shop;
  items: {
    product: Product;
    variantId?: string;
    variantLabel?: string;
    unitPrice: number;
    stock: number;
    qty: number;
  }[];
  itemsTotal: number;
  mrpSavings: number;
  fulfilment: FulfilmentMethod;
  deliveryFee: number;
}

/** Groups the bag by shop and computes a display ESTIMATE. Server re-prices at checkout. */
export function useBagGroups() {
  const { lines } = useCart();
  return useMemo(() => {
    const map = new Map<string, ShopGroup>();
    for (const line of Object.values(lines) as CartLine[]) {
      if (!Number.isInteger(line.qty) || line.qty <= 0) continue;
      const product = productById(line.productId);
      if (!product) continue;
      const variant = line.variantId
        ? product.variants?.find((item) => item.id === line.variantId)
        : undefined;
      if (line.variantId && !variant) continue;
      const shop = shopById(product.shopId);
      if (!shop) continue;
      const g = map.get(shop.id) ?? {
        shop,
        items: [],
        itemsTotal: 0,
        mrpSavings: 0,
        fulfilment: (shop.fulfilment.find((f) => f !== "pickup") ?? "pickup") as FulfilmentMethod,
        deliveryFee: 0,
      };
      const unitPrice = variant?.price ?? product.price;
      g.items.push({
        product,
        variantId: line.variantId,
        variantLabel: variant?.label,
        unitPrice,
        stock: variant?.stock ?? product.stock,
        qty: line.qty,
      });
      g.itemsTotal += unitPrice * line.qty;
      if (!variant && product.mrp) g.mrpSavings += (product.mrp - product.price) * line.qty;
      map.set(shop.id, g);
    }
    const groups = [...map.values()].map((g) => ({
      ...g,
      deliveryFee: deliveryFeeFor(g.fulfilment, g.itemsTotal),
    }));
    const itemsTotal = groups.reduce((s, g) => s + g.itemsTotal, 0);
    const delivery = groups.reduce((s, g) => s + g.deliveryFee, 0);
    const savings = groups.reduce((s, g) => s + g.mrpSavings, 0);
    const blocked = groups.filter((g) => !g.shop.isOpen);
    const issues = bagReadiness(Object.values(lines), productById, shopById);
    return {
      issues,
      canCheckout: issues.length === 0 && groups.length > 0,
      groups,
      itemsTotal,
      delivery,
      savings,
      total: itemsTotal + delivery,
      blocked,
      freeAbove: FREE_PLATFORM_DELIVERY_ABOVE,
    };
  }, [lines]);
}

export function ShopCheckoutDetails({ group }: { group: ShopGroup }) {
  const minimum = group.shop.minimumOrderAmount;
  const known = minimum !== undefined && Number.isFinite(minimum) && minimum >= 0;
  return (
    <dl className="space-y-2 border-t border-border bg-secondary/30 p-4 text-sm">
      <div className="flex justify-between gap-3">
        <dt>Items subtotal</dt>
        <dd>{inr(group.itemsTotal)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>Estimated {group.fulfilment === "pickup" ? "pickup fee" : "delivery"}</dt>
        <dd>{group.deliveryFee ? inr(group.deliveryFee) : "Free"}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>
          Minimum order <span className="text-xs text-muted-foreground">(items only)</span>
        </dt>
        <dd>{known ? (minimum === 0 ? "No minimum" : inr(minimum)) : "Not provided"}</dd>
      </div>
      {known && minimum! > group.itemsTotal && (
        <div className="text-destructive">
          Add {inr(minimum! - group.itemsTotal)} more from this shop.
        </div>
      )}
      <div className="flex justify-between gap-3 font-semibold">
        <dt>Shop estimated total</dt>
        <dd>{inr(group.itemsTotal + group.deliveryFee)}</dd>
      </div>
    </dl>
  );
}

export function BagIssues({ issues }: { issues: { message: string }[] }) {
  if (!issues.length) return null;
  return (
    <div
      role="alert"
      className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <p className="font-semibold">Review your bag before checkout</p>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        {issues.map((issue, i) => (
          <li key={i}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

export function Totals({
  itemsTotal,
  delivery,
  savings,
  total,
}: {
  itemsTotal: number;
  delivery: number;
  savings: number;
  total: number;
}) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt>Items</dt>
        <dd className="tabular-nums">{inr(itemsTotal)}</dd>
      </div>
      {savings > 0 && (
        <div className="flex justify-between text-success">
          <dt>Savings vs MRP</dt>
          <dd className="tabular-nums">−{inr(savings)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt>Delivery</dt>
        <dd className="tabular-nums">{delivery ? inr(delivery) : "Free"}</dd>
      </div>
      <div className="perforated my-3" aria-hidden />
      <div className="flex justify-between text-base font-semibold">
        <dt>Estimated total</dt>
        <dd className="tabular-nums">{inr(total)}</dd>
      </div>
      <p className="text-xs text-muted-foreground">
        This is an estimate. Item availability, offers and the final amount are confirmed when you
        place the order.
      </p>
    </dl>
  );
}
