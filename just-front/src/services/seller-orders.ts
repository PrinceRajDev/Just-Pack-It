import { api, apiAll } from "@/lib/api/client";
import type { SellerSuborder, SellerOrderStatus } from "@/domain/seller-orders";
export const sellerOrders = {
  list: (status?: SellerOrderStatus) =>
    apiAll<SellerSuborder>(
      `/seller/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  transition: (
    sub: SellerSuborder,
    status: Exclude<SellerOrderStatus, "placed">,
    reason?: string,
  ) =>
    api<SellerSuborder>(
      `/seller/orders/${encodeURIComponent(sub.orderId)}/suborders/${encodeURIComponent(sub.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          version: sub.version,
          status,
          ...(status === "cancelled" ? { reason: reason?.trim() } : {}),
        }),
      },
    ),
};
