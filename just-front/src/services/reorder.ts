import { reviewCart } from "./cart-review";
import { catalog } from "./catalog";
import { isDemoMode } from "@/lib/config";
import { reorderItems, reorderPlan } from "@/lib/reorder";
import type { CartLine, Order } from "@/domain/types";
import type { CartReview } from "@/domain/cart-review";
export async function reviewReorder(order: Order, areaId: string, cart: CartLine[]) {
  const items = reorderItems(order);
  if (!items.length) return [];
  if (!isDemoMode) return reorderPlan(order, await reviewCart(areaId, items), cart);
  const shops = await catalog.shops(areaId);
  const lines = await Promise.all(
    items.map(async (item) => {
      const product = await catalog.product(item.productId);
      const shop = shops.find((shop) => shop.id === product?.shopId);
      const variant = product?.variants?.find((variant) => variant.id === item.variantId);
      const valid =
        product && shop && (!product.variants?.length || variant) && (!item.variantId || variant);
      return {
        ...item,
        product: valid ? product : undefined,
        shopId: shop?.id,
        unitPrice: variant?.price ?? product?.price,
        availableStock: variant?.stock ?? product?.stock,
        issues: valid ? [] : [{ code: "PRODUCT_UNAVAILABLE", message: "Unavailable" }],
      };
    }),
  );
  const review: CartReview = {
    checkedAt: new Date().toISOString(),
    areaId,
    currency: "INR",
    reserved: false,
    checkoutAvailable: false,
    lines,
    shops: shops.map((shop) => ({ shop, itemsSubtotal: 0, issues: [] })),
    itemsSubtotal: 0,
    deliveryTotal: null,
    grandTotal: null,
  };
  return reorderPlan(order, review, cart);
}
