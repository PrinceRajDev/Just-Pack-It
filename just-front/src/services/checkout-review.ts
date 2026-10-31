import { api } from "@/lib/api/client";
import type { CartLine, FulfilmentMethod } from "@/domain/types";
import type { CartReview, CartReviewIssue } from "@/domain/cart-review";
export interface CheckoutReview extends Omit<
  CartReview,
  "checkoutAvailable" | "deliveryTotal" | "grandTotal"
> {
  checkoutAvailable: boolean;
  deliveryTotal: number | null;
  grandTotal: number | null;
  paymentMethods?: ("cod" | "razorpay")[];
  pricingPolicy?: string | null;
  addressId: string;
  addressVersion: number;
  issues: CartReviewIssue[];
  fulfilments: {
    shopId: string;
    method: FulfilmentMethod | null;
    listedFee: number | null;
    issues: CartReviewIssue[];
  }[];
}
export function reviewCheckout(
  areaId: string,
  addressId: string,
  addressVersion: number,
  lines: CartLine[],
  fulfilments: { shopId: string; method: FulfilmentMethod }[],
  signal?: AbortSignal,
) {
  return api<CheckoutReview>("/checkout/review", {
    method: "POST",
    signal,
    body: JSON.stringify({
      areaId,
      addressId,
      addressVersion,
      items: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })),
      fulfilments,
    }),
  });
}
