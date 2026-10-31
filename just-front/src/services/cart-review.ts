import { api } from "@/lib/api/client";
import type { CartLine } from "@/domain/types";
import type { CartReview } from "@/domain/cart-review";
import { rememberReviewedCatalogue } from "./catalog";
export async function reviewCart(areaId: string, lines: CartLine[], signal?: AbortSignal) {
  const result = await api<CartReview>("/cart/quote", {
    method: "POST",
    signal,
    body: JSON.stringify({
      areaId,
      items: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })),
    }),
  });
  rememberReviewedCatalogue(
    result.lines.flatMap((line) => (line.product ? [line.product] : [])),
    result.shops.map((group) => group.shop),
  );
  return result;
}
