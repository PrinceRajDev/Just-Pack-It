import { api, apiResponse, ApiError } from "@/lib/api/client";
import type {
  AdminPayment,
  AdminPaymentDetail,
  PaymentMode,
  PaymentState,
} from "@/domain/admin-payments";
import type { Order } from "@/domain/types";
export const adminPayments = {
  async list(state: PaymentState | "all", mode: PaymentMode, cursor?: string) {
    const query = new URLSearchParams({ state, mode, limit: "25" });
    if (cursor) query.set("cursor", cursor);
    const result = await apiResponse<AdminPayment[]>(`/admin/payments?${query}`);
    const next = result.headers.get("X-Next-Cursor") ?? undefined;
    if (result.headers.get("X-Has-More") === "true" && !next)
      throw new ApiError(
        "Pagination headers are missing. Contact the operator.",
        502,
        "PAGINATION_HEADERS_MISSING",
      );
    return { payments: result.data, next };
  },
  get: (id: string) => api<AdminPaymentDetail>(`/admin/payments/${encodeURIComponent(id)}`),
  reconcile: (
    id: string,
    mapping?: { providerOrderId: string; reason: string; confirmProviderOrder: true },
  ) =>
    api<Order>(`/admin/payments/${encodeURIComponent(id)}/reconcile`, {
      method: "POST",
      body: JSON.stringify(mapping ?? {}),
      signal: AbortSignal.timeout(30_000),
    }),
};
