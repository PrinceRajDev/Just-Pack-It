import { api } from "@/lib/api/client";
import type { AdminRefund } from "@/domain/refunds";
export const adminRefunds = {
  list: (orderId: string) =>
    api<AdminRefund[]>(`/admin/payments/${encodeURIComponent(orderId)}/refunds`),
  submit: (id: string) =>
    api<AdminRefund>(`/admin/refunds/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      body: JSON.stringify({ confirmRefund: true }),
      signal: AbortSignal.timeout(45_000),
    }),
  reconcile: (id: string) =>
    api<AdminRefund>(`/admin/refunds/${encodeURIComponent(id)}/reconcile`, {
      method: "POST",
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    }),
};
