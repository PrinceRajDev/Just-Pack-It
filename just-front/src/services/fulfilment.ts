import { api } from "@/lib/api/client";
import type { FulfilmentMethod } from "@/domain/types";
export interface FulfilmentReview {
  checkedAt: string;
  addressId: string;
  addressVersion: number;
  checkoutAvailable: false;
  reserved: false;
  shops: {
    shopId: string;
    issues: { code: string; message: string }[];
    options: {
      method: FulfilmentMethod;
      status: "eligible" | "unavailable" | "unverified";
      listedFee: number | null;
      message: string;
    }[];
  }[];
}
export function reviewFulfilment(addressId: string, shopIds: string[], signal?: AbortSignal) {
  return api<FulfilmentReview>("/cart/fulfilment", {
    method: "POST",
    signal,
    body: JSON.stringify({ addressId, shopIds }),
  });
}
