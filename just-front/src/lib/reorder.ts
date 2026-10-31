import type { CartLine, Order } from "@/domain/types";
import type { CartReview } from "@/domain/cart-review";

export function reorderItems(order: Order): CartLine[] {
  const items = new Map<string, CartLine>();
  for (const sub of order.subOrders)
    for (const line of sub.lines) {
      const key = `${line.productId}:${line.variantId ?? ""}`;
      const previous = items.get(key);
      items.set(key, {
        productId: line.productId,
        variantId: line.variantId,
        qty: Math.min(999, (previous?.qty ?? 0) + line.qty),
      });
    }
  if (items.size > 100)
    throw new Error("This order has too many lines. Add items from each shop instead.");
  return [...items.values()];
}
export function reorderPlan(order: Order, review: CartReview, cart: CartLine[]) {
  let slots = Math.max(0, 100 - cart.length);
  return review.lines.map((line) => {
    const historical = order.subOrders
      .flatMap((sub) => sub.lines.map((item) => ({ item, shopId: sub.shopId })))
      .filter(({ item }) => item.productId === line.productId && item.variantId === line.variantId);
    const old = historical[0];
    const group = review.shops.find((group) => group.shop.id === line.shopId);
    const existing =
      cart.find((item) => item.productId === line.productId && item.variantId === line.variantId)
        ?.qty ?? 0;
    const invalid =
      !old ||
      historical.some((item) => item.shopId !== line.shopId) ||
      !line.product ||
      line.product.shopId !== old.shopId ||
      !group ||
      !group.shop.isOpen ||
      line.issues.some((issue) => issue.code !== "INSUFFICIENT_STOCK");
    const room = Math.max(0, Math.min(999, line.availableStock ?? 0) - existing);
    const newLine = !existing;
    const full = newLine && slots === 0;
    const qty = invalid || full ? 0 : Math.min(line.qty, room);
    if (qty > 0 && newLine) slots--;
    return {
      productId: line.productId,
      variantId: line.variantId,
      name: old?.item.name ?? "Unavailable item",
      variantLabel: old?.item.variantLabel,
      shopName:
        group?.shop.name ??
        order.subOrders.find((sub) => sub.shopId === old?.shopId)?.shopName ??
        "Shop unavailable",
      requested: line.qty,
      qty,
      price: line.unitPrice,
      oldPrice: old?.item.price,
      note:
        !group?.shop.isOpen && group
          ? "Shop is closed"
          : invalid
            ? "Exact listing or option is unavailable in this area"
            : full
              ? "Bag has 100 different items"
              : !qty
                ? "No additional stock available"
                : qty < line.qty
                  ? "Quantity reduced to available stock"
                  : "Ready to add",
    };
  });
}
export type ReorderPlan = ReturnType<typeof reorderPlan>;
