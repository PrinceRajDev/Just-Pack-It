import { z } from "zod";
import type { Shop } from "@/domain/types";

export const shopSearchSchema = z.object({
  q: z.string().optional(),
  // Keep existing ?sort=open links working; new UI separates filtering from sorting.
  sort: z.enum(["recommended", "open", "name", "fee_asc", "fee_desc"]).optional(),
  openOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
  fulfilment: z.enum(["pickup", "delivery", "seller_delivery", "platform_delivery"]).optional(),
});

export type ShopSearch = z.infer<typeof shopSearchSchema>;

export function listedDeliveryFee(shop: Shop): number | undefined {
  return shop.fulfilment.some((method) => method !== "pickup") &&
    typeof shop.deliveryFee === "number" &&
    Number.isFinite(shop.deliveryFee) &&
    shop.deliveryFee >= 0
    ? shop.deliveryFee
    : undefined;
}

/** Filters only the already area-eligible catalogue, without mutating cached records. */
export function discoverShops(shops: Shop[], category: string, query: ShopSearch): Shop[] {
  const term = query.q?.trim().toLocaleLowerCase() ?? "";
  return shops
    .filter((shop) => {
      if (!shop.categories.includes(category)) return false;
      if ((query.openOnly || query.sort === "open") && !shop.isOpen) return false;
      if (query.fulfilment === "delivery" && !shop.fulfilment.some((m) => m !== "pickup"))
        return false;
      if (
        query.fulfilment &&
        query.fulfilment !== "delivery" &&
        !shop.fulfilment.includes(query.fulfilment)
      )
        return false;
      return (
        !term || `${shop.name} ${shop.tagline} ${shop.locality}`.toLocaleLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (query.sort === "fee_asc" || query.sort === "fee_desc") {
        const left = listedDeliveryFee(a),
          right = listedDeliveryFee(b);
        // Missing fees always follow known fees, including descending order.
        if (left === undefined && right !== undefined) return 1;
        if (right === undefined && left !== undefined) return -1;
        if (left !== undefined && right !== undefined && left !== right)
          return query.sort === "fee_asc" ? left - right : right - left;
      }
      if (query.sort === "name" || query.sort?.startsWith("fee_"))
        return a.name.localeCompare(b.name);
      return Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name);
    });
}
