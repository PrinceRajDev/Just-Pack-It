import { apiResponse, ApiError } from "@/lib/api/client";
import type { AdminOrder } from "@/domain/admin-orders";
export type CashFilter = "all" | "outstanding" | "recorded";
export async function listAdminOrders(cash: CashFilter, cursor?: string, orderId?: string) {
  const query = new URLSearchParams({ cash, limit: "25" });
  if (orderId) query.set("orderId", orderId);
  if (cursor) query.set("cursor", cursor);
  const result = await apiResponse<AdminOrder[]>(`/admin/orders?${query}`);
  const next = result.headers.get("X-Next-Cursor") ?? undefined;
  if (result.headers.get("X-Has-More") === "true" && !next)
    throw new ApiError(
      "Pagination headers are missing. Contact the operator.",
      502,
      "PAGINATION_HEADERS_MISSING",
    );
  return { orders: result.data, next };
}
